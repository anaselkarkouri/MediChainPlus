"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function loadFabricGatewayDeps() {
  try {
    return {
      grpc: require("@grpc/grpc-js"),
      gateway: require("@hyperledger/fabric-gateway"),
    };
  } catch (error) {
    const wrapped = new Error("@hyperledger/fabric-gateway dependency is not installed");
    wrapped.statusCode = 503;
    wrapped.cause = error;
    throw wrapped;
  }
}

function expandEnvPlaceholders(value) {
  if (Array.isArray(value)) {
    return value.map(expandEnvPlaceholders);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, expandEnvPlaceholders(child)])
    );
  }
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (match, envName) => process.env[envName] || match);
}

function parseFabricResult(result) {
  if (!result || result.length === 0) {
    return { ok: true };
  }

  const text = Buffer.from(result).toString("utf8");
  if (!text) {
    return { ok: true };
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readJsonFile(filePath, missingMessage) {
  if (!fs.existsSync(filePath)) {
    const error = new Error(missingMessage);
    error.statusCode = 503;
    throw error;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadIdentity(walletPath, identityLabel) {
  const identityPath = path.join(walletPath, `${identityLabel}.id`);
  const identity = readJsonFile(identityPath, `Fabric identity '${identityLabel}' not found in wallet`);

  if (identity.type !== "X.509" || !identity.mspId || !identity.credentials?.certificate || !identity.credentials?.privateKey) {
    const error = new Error(`Fabric identity '${identityLabel}' must be an X.509 identity with certificate and private key`);
    error.statusCode = 503;
    throw error;
  }

  return identity;
}

function selectPeer(profile, channelName, mspId) {
  const channelPeers = Object.keys(profile.channels?.[channelName]?.peers || {});
  const organisation = Object.values(profile.organizations || {}).find((org) => org.mspid === mspId);
  const candidateNames = organisation?.peers?.length
    ? organisation.peers.filter((peerName) => channelPeers.length === 0 || channelPeers.includes(peerName))
    : channelPeers;
  const peerName = candidateNames[0];
  const peer = peerName ? profile.peers?.[peerName] : null;

  if (!peer?.url) {
    const error = new Error(`No Fabric peer found for channel '${channelName}' and MSP '${mspId}'`);
    error.statusCode = 503;
    throw error;
  }

  return { peerName, peer };
}

function createGrpcClient(grpc, peerName, peer) {
  const peerUrl = new URL(peer.url);
  const endpoint = `${peerUrl.hostname}:${peerUrl.port}`;
  const tlsCertPath = peer.tlsCACerts?.path;
  const tlsRootCert = tlsCertPath && fs.existsSync(tlsCertPath) ? fs.readFileSync(tlsCertPath) : undefined;
  const credentials = peerUrl.protocol === "grpcs:"
    ? grpc.credentials.createSsl(tlsRootCert)
    : grpc.credentials.createInsecure();
  const hostOverride = peer.grpcOptions?.["ssl-target-name-override"] || peer.grpcOptions?.hostnameOverride || peerName;

  return new grpc.Client(endpoint, credentials, {
    "grpc.ssl_target_name_override": hostOverride,
  });
}

function defaultCallOptions() {
  return { deadline: Date.now() + 30_000 };
}

class FabricGatewayService {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.gateway = null;
    this.network = null;
  }

  status() {
    return {
      connectionProfilePath: this.config.connectionProfilePath,
      connectionProfileExists: fs.existsSync(this.config.connectionProfilePath),
      walletPath: this.config.walletPath,
      walletExists: fs.existsSync(this.config.walletPath),
      identity: this.config.identity,
      channelName: this.config.channelName,
      chaincodes: this.config.chaincodes,
      connected: Boolean(this.network),
    };
  }

  loadConnectionProfile() {
    if (!fs.existsSync(this.config.connectionProfilePath)) {
      const error = new Error("Fabric connection profile not found");
      error.statusCode = 503;
      throw error;
    }

    return expandEnvPlaceholders(JSON.parse(fs.readFileSync(this.config.connectionProfilePath, "utf8")));
  }

  async connect() {
    if (this.network) {
      return this.network;
    }

    if (!fs.existsSync(this.config.walletPath)) {
      const error = new Error("Fabric wallet path not found");
      error.statusCode = 503;
      throw error;
    }

    const { grpc, gateway } = loadFabricGatewayDeps();
    const identity = loadIdentity(this.config.walletPath, this.config.identity);
    const profile = this.loadConnectionProfile();
    const { peerName, peer } = selectPeer(profile, this.config.channelName, identity.mspId);
    const privateKey = crypto.createPrivateKey(identity.credentials.privateKey);

    this.client = createGrpcClient(grpc, peerName, peer);
    this.gateway = gateway.connect({
      client: this.client,
      identity: {
        mspId: identity.mspId,
        credentials: Buffer.from(identity.credentials.certificate),
      },
      signer: gateway.signers.newPrivateKeySigner(privateKey),
      evaluateOptions: defaultCallOptions,
      endorseOptions: defaultCallOptions,
      submitOptions: defaultCallOptions,
      commitStatusOptions: defaultCallOptions,
    });
    this.network = this.gateway.getNetwork(this.config.channelName);
    return this.network;
  }

  async getContract(chaincodeName) {
    const network = await this.connect();
    return network.getContract(chaincodeName);
  }

  async evaluate(chaincodeName, functionName, args = []) {
    const contract = await this.getContract(chaincodeName);
    const result = await contract.evaluateTransaction(functionName, ...args.map(String));
    return parseFabricResult(result);
  }

  async submit(chaincodeName, functionName, args = []) {
    const contract = await this.getContract(chaincodeName);
    const result = await contract.submitTransaction(functionName, ...args.map(String));
    return parseFabricResult(result);
  }

  disconnect() {
    if (this.gateway) {
      this.gateway.close();
    }
    if (this.client) {
      this.client.close();
    }
    this.client = null;
    this.gateway = null;
    this.network = null;
  }
}

module.exports = {
  FabricGatewayService,
};
