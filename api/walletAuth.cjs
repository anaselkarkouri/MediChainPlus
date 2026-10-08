"use strict";

const crypto = require("crypto");
const { ethers } = require("ethers");

const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function normaliseAddress(address) {
  if (!ethers.isAddress(address)) {
    const error = new Error("Invalid wallet address");
    error.statusCode = 400;
    throw error;
  }
  return ethers.getAddress(address);
}

function createChallenge(address, options = {}) {
  const normalisedAddress = normaliseAddress(address);
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const domain = options.domain || "MediChain+ API";
  const uri = options.uri || "http://127.0.0.1";
  const chainId = options.chainId || "31337";
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    normalisedAddress,
    "",
    "MediChain+ API login",
    "",
    `URI: ${uri}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join("\n");

  challenges.set(normalisedAddress.toLowerCase(), {
    message,
    expiresAt: Date.parse(expiresAt),
  });

  return {
    address: normalisedAddress,
    message,
    expiresInSeconds: Math.floor(CHALLENGE_TTL_MS / 1000),
  };
}

function verifyChallenge(address, signature) {
  const normalisedAddress = normaliseAddress(address);
  const key = normalisedAddress.toLowerCase();
  const challenge = challenges.get(key);

  if (!challenge) {
    const error = new Error("No active challenge for this wallet");
    error.statusCode = 400;
    throw error;
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(key);
    const error = new Error("Challenge expired");
    error.statusCode = 400;
    throw error;
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(challenge.message, signature);
  } catch {
    const error = new Error("Invalid signature");
    error.statusCode = 401;
    throw error;
  }

  if (recovered.toLowerCase() !== key) {
    const error = new Error("Signature does not match wallet address");
    error.statusCode = 401;
    throw error;
  }

  challenges.delete(key);
  return normalisedAddress;
}

function clearExpiredChallenges(now = Date.now()) {
  for (const [key, challenge] of challenges.entries()) {
    if (now > challenge.expiresAt) {
      challenges.delete(key);
    }
  }
}

module.exports = {
  createChallenge,
  verifyChallenge,
  clearExpiredChallenges,
  normaliseAddress,
};
