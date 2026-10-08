"use strict";

const path = require("path");
const fs = require("fs");
const { buildAuthConfig } = require("./authz.cjs");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function readEnv(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return String(value).trim();
}

function readNumberEnv(name, fallback) {
  const raw = readEnv(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }
  return value;
}

function readBooleanEnv(name, fallback) {
  const raw = readEnv(name, String(fallback)).toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function readLimitEnv(name, fallback) {
  const raw = readEnv(name, fallback);
  if (!/^\d+(b|kb|mb)$/i.test(raw)) {
    throw new Error(`${name} must be a size such as 512kb, 5mb, or 100b`);
  }
  return raw.toLowerCase();
}

function resolveProjectPath(value) {
  if (!value) {
    return "";
  }
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function normalisePrivateKey(value) {
  if (!value) {
    return "";
  }
  return value.startsWith("0x") ? value : `0x${value}`;
}

const rootDir = path.resolve(__dirname, "..");
const deploymentFile = readEnv("MEDICHAIN_DEPLOYMENT_FILE");
const deployments = deploymentFile ? JSON.parse(fs.readFileSync(deploymentFile, "utf8")) : {};
const jwtSecret = readEnv("JWT_SECRET", "medichain-local-jwt-secret");

const signerPrivateKeyValue = normalisePrivateKey(readEnv("API_SIGNER_PRIVATE_KEY", readEnv("PRIVATE_KEY")));
const demoAddress = (() => {
  try {
    if (signerPrivateKeyValue) {
      const { ethers } = require("ethers");
      return new ethers.Wallet(signerPrivateKeyValue).address;
    }
  } catch {
    /* fall through to deterministic placeholder */
  }
  return "0x000000000000000000000000000000000000dEaD";
})();

if (process.env.NODE_ENV === "production" && (jwtSecret === "medichain-local-jwt-secret" || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET must be set to a strong value in production");
}

module.exports = {
  apiPort: readNumberEnv("API_PORT", 3001),
  rpcUrl: readEnv("API_RPC_URL", readEnv("RPC_URL", "http://127.0.0.1:8545")),
  jwtSecret,
  jwtIssuer: readEnv("JWT_ISSUER", "medichain-api"),
  jwtAudience: readEnv("JWT_AUDIENCE", "medichain-frontend"),
  jwtExpiresInSeconds: readNumberEnv("JWT_EXPIRES_IN_SECONDS", 3600),
  signerPrivateKey: signerPrivateKeyValue,
  signerIndex: readNumberEnv("API_SIGNER_INDEX", 0),
  demoAddress,
  reimbursementAddress: readEnv("REIMBURSEMENT_CONTRACT_ADDRESS", deployments.reimbursement || ""),
  drugTraceabilityAddress: readEnv("DRUG_TRACEABILITY_CONTRACT_ADDRESS", deployments.drugTraceability || ""),
  auth: buildAuthConfig(process.env),
  security: {
    jsonLimit: readLimitEnv("API_JSON_LIMIT", "5mb"),
    maxBase64Bytes: readNumberEnv("API_MAX_BASE64_BYTES", 5 * 1024 * 1024),
    ipfsTimeoutMs: readNumberEnv("API_IPFS_TIMEOUT_MS", 15000),
    eventBlockLimit: readNumberEnv("API_EVENT_BLOCK_LIMIT", 5000),
    rateLimitWindowMs: readNumberEnv("API_RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: readNumberEnv("API_RATE_LIMIT_MAX", 120),
  },
  fabric: {
    mode: readEnv("FABRIC_MODE", "mock"),
    connectionProfilePath: resolveProjectPath(
      readEnv("FABRIC_CONNECTION_PROFILE", "./fabric-anas/network/connection-org1.json")
    ),
    walletPath: resolveProjectPath(readEnv("FABRIC_WALLET_PATH", "./wallet/org1")),
    identity: readEnv("FABRIC_IDENTITY", "appUser"),
    channelName: readEnv("FABRIC_CHANNEL", "medichannel"),
    discoveryEnabled: readBooleanEnv("FABRIC_DISCOVERY_ENABLED", true),
    discoveryAsLocalhost: readBooleanEnv("FABRIC_DISCOVERY_AS_LOCALHOST", true),
    chaincodes: {
      patientRegistry: readEnv("FABRIC_CC_PATIENT_REGISTRY", "patient-registry"),
      medicalRecord: readEnv("FABRIC_CC_MEDICAL_RECORD", "medical-record"),
      prescription: readEnv("FABRIC_CC_PRESCRIPTION", "prescription"),
    },
    mockStorePath: resolveProjectPath(readEnv("FABRIC_MOCK_STORE", "./data/fabric-mock.local.json")),
  },
  ipfs: {
    apiUrl: readEnv("IPFS_API_URL", "http://127.0.0.1:5001"),
    gatewayUrl: readEnv("IPFS_GATEWAY_URL", "http://127.0.0.1:8080/ipfs"),
  },
  artifacts: {
    reimbursement: path.join(
      rootDir,
      "artifacts",
      "contracts",
      "ReimbursementContract.sol",
      "ReimbursementContract.json"
    ),
    drugTraceability: path.join(
      rootDir,
      "artifacts",
      "contracts",
      "DrugTraceabilityContract.sol",
      "DrugTraceabilityContract.json"
    ),
  },
};
