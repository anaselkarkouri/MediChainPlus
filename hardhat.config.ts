import hardhatEthersPlugin from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchersPlugin from "@nomicfoundation/hardhat-ethers-chai-matchers";
import { defineConfig } from "hardhat/config";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath = ".env"): void {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return;
  }

  for (const line of fs.readFileSync(resolvedPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvFile();

function env(key: string, fallback = ""): string {
  const value = process.env[key];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function normalisePrivateKey(value: string): string {
  if (value.trim() === "") {
    return "";
  }
  return value.startsWith("0x") ? value : `0x${value}`;
}

const privateKey = normalisePrivateKey(env("PRIVATE_KEY"));
const rpcUrl = env("RPC_URL", "https://rpc-amoy.polygon.technology");
const polygonRpcUrl = env("POLYGON_RPC_URL", "https://polygon-rpc.com");
const externalAccounts = privateKey ? { accounts: [privateKey] } : {};

export default defineConfig({
  plugins: [
    hardhatEthersPlugin,
    hardhatEthersChaiMatchersPlugin,
  ],
  solidity: {
    profiles: {
      default: {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "paris",
        },
      },
    },
  },
  networks: {
    default: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    node: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: env("LOCAL_RPC_URL", "http://127.0.0.1:8545"),
      chainId: 31337,
    },
    amoy: {
      type: "http",
      chainType: "l1",
      url: rpcUrl,
      chainId: 80002,
      ...externalAccounts,
    },
    polygon: {
      type: "http",
      chainType: "l1",
      url: polygonRpcUrl,
      chainId: 137,
      ...externalAccounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
});
