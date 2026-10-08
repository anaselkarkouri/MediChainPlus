"use strict";

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function readEnv(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return String(value).trim();
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(__dirname, "..", value);
}

function firstFile(directory) {
  if (!fs.existsSync(directory)) {
    return "";
  }
  const files = fs.readdirSync(directory).filter((file) => !file.startsWith("."));
  return files.length ? path.join(directory, files[0]) : "";
}

function defaultFabricSamplesPath() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return home ? path.join(home, "fabric-samples") : "";
}

async function main() {
  const fabricSamplesPath = readEnv("FABRIC_SAMPLES_PATH", defaultFabricSamplesPath());
  const identityLabel = readEnv("FABRIC_IDENTITY", "appUser");
  const walletPath = resolvePath(readEnv("FABRIC_WALLET_PATH", "./wallet/org1"));
  const mspId = readEnv("FABRIC_MSP_ID", "Org1MSP");
  const userName = readEnv("FABRIC_IMPORT_USER", "User1@org1.example.com");

  const userMspPath = path.join(
    fabricSamplesPath,
    "test-network",
    "organizations",
    "peerOrganizations",
    "org1.example.com",
    "users",
    userName,
    "msp"
  );

  const certificatePath = firstFile(path.join(userMspPath, "signcerts"));
  const privateKeyPath = firstFile(path.join(userMspPath, "keystore"));

  if (!fabricSamplesPath || !fs.existsSync(userMspPath)) {
    throw new Error(
      `Fabric user MSP not found: ${userMspPath}\n` +
      "Start Anas Fabric network first, or set FABRIC_SAMPLES_PATH to your fabric-samples folder."
    );
  }
  if (!certificatePath || !privateKeyPath) {
    throw new Error(`Certificate or private key not found under ${userMspPath}`);
  }

  fs.mkdirSync(walletPath, { recursive: true });

  const identity = {
    credentials: {
      certificate: fs.readFileSync(certificatePath, "utf8"),
      privateKey: fs.readFileSync(privateKeyPath, "utf8"),
    },
    mspId,
    type: "X.509",
  };
  fs.writeFileSync(path.join(walletPath, `${identityLabel}.id`), JSON.stringify(identity, null, 2));

  console.log(`Imported Fabric identity '${identityLabel}' into ${walletPath}`);
  console.log(`Source user: ${userName}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
