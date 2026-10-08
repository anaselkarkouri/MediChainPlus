"use strict";

const fs = require("fs");
const { ethers } = require("ethers");

function loadAbi(artifactPath) {
  if (!fs.existsSync(artifactPath)) return [];
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

async function createContractContext(config) {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { staticNetwork: true });
  // Avoid getSigner() which triggers network detection at startup; use a wallet instead.
  const wallet = config.signerPrivateKey
    ? new ethers.Wallet(config.signerPrivateKey, provider)
    : new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
  // NonceManager serialises nonces so rapid back-to-back writes from the single
  // API signer don't collide ("nonce has already been used").
  const signer = new ethers.NonceManager(wallet);

  const reimbursementAbi = loadAbi(config.artifacts.reimbursement);
  const drugTraceabilityAbi = loadAbi(config.artifacts.drugTraceability);

  return {
    provider,
    signer,
    reimbursement: config.reimbursementAddress
      ? new ethers.Contract(config.reimbursementAddress, reimbursementAbi, signer)
      : null,
    drugTraceability: config.drugTraceabilityAddress
      ? new ethers.Contract(config.drugTraceabilityAddress, drugTraceabilityAbi, signer)
      : null,
  };
}

function parseAmount(body) {
  let amount;
  try {
    if (body.amountWei !== undefined) {
      amount = BigInt(body.amountWei);
    } else if (body.amountEth !== undefined) {
      amount = ethers.parseEther(String(body.amountEth));
    } else if (body.amount !== undefined) {
      amount = BigInt(body.amount);
    }
  } catch {
    const error = new Error("amount must be a valid integer wei value or decimal ether value");
    error.statusCode = 400;
    throw error;
  }

  if (amount === undefined) {
    const error = new Error("amountWei, amountEth, or amount is required");
    error.statusCode = 400;
    throw error;
  }

  if (amount <= 0n) {
    const error = new Error("amount must be greater than zero");
    error.statusCode = 400;
    throw error;
  }
  return amount;
}

function ensureContract(contract, name) {
  if (!contract) {
    const error = new Error(`${name} address is not configured`);
    error.statusCode = 503;
    throw error;
  }
}

function readBlockRange(query, maxSpan = 5000) {
  const fromBlock = query.fromBlock === undefined ? 0 : Number(query.fromBlock);
  const toBlock = (query.toBlock === undefined || query.toBlock === "latest") ? "latest" : Number(query.toBlock);

  if (!Number.isInteger(fromBlock) || fromBlock < 0) {
    const error = new Error("fromBlock must be a positive integer");
    error.statusCode = 400;
    throw error;
  }

  if (toBlock !== "latest" && (!Number.isInteger(toBlock) || toBlock < fromBlock)) {
    const error = new Error("toBlock must be 'latest' or an integer greater than fromBlock");
    error.statusCode = 400;
    throw error;
  }
  if (toBlock !== "latest" && toBlock - fromBlock > maxSpan) {
    const error = new Error(`block range cannot exceed ${maxSpan} blocks`);
    error.statusCode = 400;
    throw error;
  }

  return { fromBlock, toBlock };
}

function txSummary(tx, receipt) {
  return {
    hash: tx.hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
  };
}

function findEvent(receipt, contract, eventName) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed.name === eventName) {
        return parsed;
      }
    } catch {
      // Ignore logs emitted by other contracts.
    }
  }
  return null;
}

function formatEvent(log, contract) {
  const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
  const args = {};

  for (const [key, value] of Object.entries(parsed.args)) {
    if (!Number.isNaN(Number(key))) {
      continue;
    }
    args[key] = formatValue(value);
  }

  return {
    event: parsed.name,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    args,
  };
}

function formatValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(formatValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, formatValue(child)]));
  }
  return value;
}

module.exports = {
  createContractContext,
  parseAmount,
  ensureContract,
  readBlockRange,
  txSummary,
  findEvent,
  formatEvent,
  formatValue,
};
