import { createRequire } from "node:module";
import { expect } from "chai";

const require = createRequire(import.meta.url);
const { createApp } = require("../api/server.cjs");
const { buildAuthConfig, principalForAddress } = require("../api/authz.cjs");
const { signJwt } = require("../api/jwt.cjs");

const PATIENT = "0x1111111111111111111111111111111111111111";
const OTHER_PATIENT = "0x2222222222222222222222222222222222222222";
const INSURER = "0x3333333333333333333333333333333333333333";

function baseConfig(principals) {
  return {
    apiPort: 0,
    rpcUrl: "http://127.0.0.1:8545",
    jwtSecret: "test-secret-with-enough-length-32-bytes",
    jwtIssuer: "medichain-test",
    jwtAudience: "medichain-test-ui",
    jwtExpiresInSeconds: 3600,
    reimbursementAddress: "0x4444444444444444444444444444444444444444",
    drugTraceabilityAddress: "0x5555555555555555555555555555555555555555",
    auth: buildAuthConfig({
      NODE_ENV: "production",
      API_PRINCIPALS: JSON.stringify(principals),
    }),
    security: {
      jsonLimit: "1mb",
      maxBase64Bytes: 1024,
      ipfsTimeoutMs: 1000,
      eventBlockLimit: 10,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
    },
    fabric: {
      mode: "mock",
      chaincodes: {
        patientRegistry: "patient-registry",
        medicalRecord: "medical-record",
        prescription: "prescription",
      },
    },
    ipfs: {
      apiUrl: "http://127.0.0.1:5001",
      gatewayUrl: "http://127.0.0.1:8080/ipfs",
    },
  };
}

function token(config, address) {
  const principal = principalForAddress(address, config.auth);
  return signJwt(
    { sub: address, address, roles: principal.roles, patientId: principal.patientId, doctorId: principal.doctorId, pharmacyId: principal.pharmacyId, insurerId: principal.insurerId },
    config.jwtSecret,
    config.jwtExpiresInSeconds,
    { issuer: config.jwtIssuer, audience: config.jwtAudience }
  );
}

function createFabricStub() {
  const patients = {
    "PAT-1": { patientId: "PAT-1", walletAddress: PATIENT },
    "PAT-2": { patientId: "PAT-2", walletAddress: OTHER_PATIENT },
  };
  const records = {
    "REC-1": {
      recordId: "REC-1",
      patientId: "PAT-1",
      doctorId: "DOC-1",
      accessPolicy: { patientId: "PAT-1", allowedDoctorIds: ["DOC-1"], allowedInsurerIds: ["INS-1"] },
      fileHashSHA256: "hash",
    },
  };

  return {
    status: () => ({ mode: "mock", connectionProfileExists: true }),
    evaluate: async (chaincode, functionName, args = []) => {
      if (functionName === "GetPatient") return patients[args[0]];
      if (functionName === "GetPatientConsents") return [];
      if (functionName === "GetMedicalRecord") return records[args[0]];
      if (functionName === "GetRecordsByPatient") return Object.values(records).filter((r) => r.patientId === args[0]);
      if (functionName === "GetAllPatients") return Object.values(patients);
      throw new Error(`Unexpected evaluate ${functionName}`);
    },
    submit: async () => ({ ok: true }),
  };
}

function createContractsStub(calls) {
  return {
    provider: {
      getNetwork: async () => ({ chainId: 31337n }),
      getBalance: async () => 0n,
    },
    signer: {
      getAddress: async () => "0x6666666666666666666666666666666666666666",
      sendTransaction: async () => ({ hash: "0x1", wait: async () => ({ blockNumber: 1, status: 1 }) }),
    },
    reimbursement: {
      interface: { parseLog: () => { throw new Error("no logs"); } },
      totalClaims: async () => 0n,
      submitClaim: { populateTransaction: async () => ({ data: "0xabc" }) },
      submitClaimFor: async (patient, amount) => {
        calls.push({ name: "submitClaimFor", patient, amount: amount.toString() });
        return { hash: "0x2", wait: async () => ({ blockNumber: 2, status: 1, logs: [] }) };
      },
      validateClaim: async () => ({ hash: "0x3", wait: async () => ({ blockNumber: 3, status: 1 }) }),
      executePayment: async () => ({ hash: "0x4", wait: async () => ({ blockNumber: 4, status: 1 }) }),
      getClaim: async () => [0n, PATIENT, 1n, false, false],
      queryFilter: async () => [],
      filters: { ClaimSubmitted: () => ({}), ClaimApproved: () => ({}), PaymentExecuted: () => ({}) },
    },
    drugTraceability: null,
  };
}

async function request(app, options) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${options.path}`, {
      method: options.method || "GET",
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("API security", function () {
  it("requires authentication before reading a patient record", async function () {
    const config = baseConfig({ [PATIENT]: { roles: ["patient"], patientId: "PAT-1" } });
    const app = createApp({ appConfig: config, contracts: createContractsStub([]), fabric: createFabricStub(), ipfs: {} });

    const response = await request(app, { path: "/api/fabric/patients/PAT-1" });
    expect(response.status).to.equal(401);
  });

  it("prevents a patient from reading another patient record", async function () {
    const config = baseConfig({ [PATIENT]: { roles: ["patient"], patientId: "PAT-1" } });
    const app = createApp({ appConfig: config, contracts: createContractsStub([]), fabric: createFabricStub(), ipfs: {} });

    const response = await request(app, { path: "/api/fabric/patients/PAT-2", token: token(config, PATIENT) });
    expect(response.status).to.equal(403);
  });

  it("prevents patient role from validating reimbursements", async function () {
    const config = baseConfig({ [PATIENT]: { roles: ["patient"], patientId: "PAT-1" } });
    const app = createApp({ appConfig: config, contracts: createContractsStub([]), fabric: createFabricStub(), ipfs: {} });

    const response = await request(app, { method: "POST", path: "/api/reimbursement/claims/0/validate", token: token(config, PATIENT) });
    expect(response.status).to.equal(403);
  });

  it("prevents a patient from reading another wallet reimbursement claim", async function () {
    const config = baseConfig({
      [PATIENT]: { roles: ["patient"], patientId: "PAT-1" },
      [OTHER_PATIENT]: { roles: ["patient"], patientId: "PAT-2" },
    });
    const app = createApp({ appConfig: config, contracts: createContractsStub([]), fabric: createFabricStub(), ipfs: {} });

    const response = await request(app, { path: "/api/reimbursement/claims/0", token: token(config, OTHER_PATIENT) });
    expect(response.status).to.equal(403);
  });

  it("submits gateway reimbursement claims for the authenticated wallet", async function () {
    const calls = [];
    const config = baseConfig({ [PATIENT]: { roles: ["patient"], patientId: "PAT-1" } });
    const app = createApp({ appConfig: config, contracts: createContractsStub(calls), fabric: createFabricStub(), ipfs: {} });

    const response = await request(app, {
      method: "POST",
      path: "/api/reimbursement/claims",
      token: token(config, PATIENT),
      body: { amountWei: "10" },
    });

    expect(response.status).to.equal(201);
    expect(calls).to.deep.equal([{ name: "submitClaimFor", patient: PATIENT, amount: "10" }]);
  });

  it("rejects malformed reimbursement amounts as client errors", async function () {
    const config = baseConfig({ [PATIENT]: { roles: ["patient"], patientId: "PAT-1" } });
    const app = createApp({ appConfig: config, contracts: createContractsStub([]), fabric: createFabricStub(), ipfs: {} });

    const response = await request(app, {
      method: "POST",
      path: "/api/reimbursement/claims",
      token: token(config, PATIENT),
      body: { amountWei: "not-a-number" },
    });

    expect(response.status).to.equal(400);
  });

  it("allows insurer role to validate reimbursements", async function () {
    const config = baseConfig({ [INSURER]: { roles: ["insurer"], insurerId: "INS-1" } });
    const app = createApp({ appConfig: config, contracts: createContractsStub([]), fabric: createFabricStub(), ipfs: {} });

    const response = await request(app, { method: "POST", path: "/api/reimbursement/claims/0/validate", token: token(config, INSURER) });
    expect(response.status).to.equal(200);
  });
});
