"use strict";

const crypto = require("crypto");
const express = require("express");
const { ethers } = require("ethers");
const config = require("./config.cjs");
const { FabricGatewayService } = require("./fabricGateway.cjs");
const { FabricMockService } = require("./fabricMock.cjs");
const { MedichainIpfsClient } = require("./ipfsClient.cjs");
const { signJwt, verifyJwt } = require("./jwt.cjs");
const { createChallenge, verifyChallenge, normaliseAddress } = require("./walletAuth.cjs");
const {
  assertActorId,
  assertRole,
  canAccessPatient,
  canAccessPrescription,
  canAccessRecord,
  forbidden,
  principalForAddress,
} = require("./authz.cjs");
const {
  createContractContext,
  ensureContract,
  findEvent,
  formatEvent,
  parseAmount,
  readBlockRange,
  txSummary,
} = require("./contracts.cjs");

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createAuthMiddleware(appConfig) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];

    if (!token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    try {
      req.auth = verifyJwt(token, appConfig.jwtSecret, jwtOptions(appConfig));
      return next();
    } catch (error) {
      return res.status(401).json({ error: error.message });
    }
  };
}

function createRoleMiddleware(roles) {
  return (req, res, next) => {
    try {
      assertRole(req.auth, roles);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function jwtOptions(appConfig) {
  return {
    issuer: appConfig.jwtIssuer,
    audience: appConfig.jwtAudience,
  };
}

function createSecurityHeadersMiddleware() {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cache-Control", "no-store");
    next();
  };
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress}:${req.path}`;
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count++;
    if (bucket.count > max) {
      return res.status(429).json({ error: "Too many requests" });
    }
    return next();
  };
}

async function waitFor(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return { tx, receipt };
}

function requiredString(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === "") {
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }
  return String(value);
}

function decodeBase64Field(body, fieldName = "fileBase64", maxBytes = Infinity) {
  const value = requiredString(body[fieldName], fieldName);
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    const error = new Error(`${fieldName} must be valid base64`);
    error.statusCode = 400;
    throw error;
  }
  const buffer = Buffer.from(value, "base64");
  if (buffer.length > maxBytes) {
    const error = new Error(`${fieldName} exceeds maximum allowed size`);
    error.statusCode = 413;
    throw error;
  }
  return buffer;
}

async function validateClaimWithFabric(fabric, chaincodes, body) {
  const validation = {};

  if (body.patientId) {
    validation.patient = await fabric.evaluate(
      chaincodes.patientRegistry,
      "GetPatient",
      [body.patientId]
    );
  }

  if (body.recordId) {
    validation.medicalRecord = await fabric.evaluate(
      chaincodes.medicalRecord,
      "GetMedicalRecord",
      [body.recordId]
    );

    if (
      body.patientId &&
      validation.medicalRecord.patientId &&
      validation.medicalRecord.patientId !== body.patientId
    ) {
      const error = new Error("Medical record does not belong to patientId");
      error.statusCode = 400;
      throw error;
    }
  }

  if (body.recordId && body.expectedFileHash) {
    validation.integrity = await fabric.evaluate(
      chaincodes.medicalRecord,
      "VerifyRecordIntegrity",
      [body.recordId, body.expectedFileHash]
    );

    if (validation.integrity && validation.integrity.valid === false) {
      const error = new Error("Medical record integrity validation failed");
      error.statusCode = 400;
      throw error;
    }
  }

  return Object.keys(validation).length ? validation : null;
}

async function getPatientAccessContext(fabric, chaincodes, patientId) {
  const patient = await fabric.evaluate(chaincodes.patientRegistry, "GetPatient", [patientId]);
  let consents = [];
  try {
    consents = await fabric.evaluate(chaincodes.patientRegistry, "GetPatientConsents", [patientId]);
  } catch {
    consents = [];
  }
  return { patient, consents };
}

function assertPatientAccess(auth, patient, consents = [], scope = "patient:read") {
  if (!canAccessPatient(auth, patient, consents, scope)) {
    throw forbidden("Not allowed to access this patient");
  }
}

function assertRecordAccess(auth, record) {
  if (!canAccessRecord(auth, record)) {
    throw forbidden("Not allowed to access this medical record");
  }
}

function assertPrescriptionAccess(auth, prescription) {
  if (!canAccessPrescription(auth, prescription)) {
    throw forbidden("Not allowed to access this prescription");
  }
}

function filterAccessible(items, predicate) {
  return Array.isArray(items) ? items.filter(predicate) : items;
}

function createApp({
  appConfig = config,
  contracts,
  fabric,
  ipfs,
} = {}) {
  const app = express();
  const requireAuth = createAuthMiddleware(appConfig);
  const requireRoles = (...roles) => [requireAuth, createRoleMiddleware(roles)];

  app.use(createSecurityHeadersMiddleware());
  app.use(createRateLimiter({
    windowMs: appConfig.security.rateLimitWindowMs,
    max: appConfig.security.rateLimitMax,
  }));
  app.use(express.json({ limit: appConfig.security.jsonLimit }));

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "medichain-api-gateway",
      reimbursementConfigured: Boolean(contracts.reimbursement),
      drugTraceabilityConfigured: Boolean(contracts.drugTraceability),
      fabricConfigured: fabric.status().connectionProfileExists,
      ipfsApiUrl: appConfig.ipfs.apiUrl,
    });
  });

  app.get("/api/contracts", asyncHandler(async (req, res) => {
    const network = await contracts.provider.getNetwork();
    res.json({
      rpcUrl: appConfig.rpcUrl,
      chainId: network.chainId.toString(),
      signer: await contracts.signer.getAddress(),
      reimbursementContract: appConfig.reimbursementAddress || null,
      drugTraceabilityContract: appConfig.drugTraceabilityAddress || null,
    });
  }));

  app.post("/api/auth/challenge", (req, res) => {
    res.json(createChallenge(req.body.address, {
      domain: appConfig.jwtAudience,
      uri: appConfig.rpcUrl,
    }));
  });

  app.post("/api/auth/verify", (req, res) => {
    const address = verifyChallenge(req.body.address, req.body.signature);
    const principal = principalForAddress(address, appConfig.auth);
    const token = signJwt(
      { sub: address, address, roles: principal.roles, patientId: principal.patientId, doctorId: principal.doctorId, pharmacyId: principal.pharmacyId, insurerId: principal.insurerId },
      appConfig.jwtSecret,
      appConfig.jwtExpiresInSeconds,
      jwtOptions(appConfig)
    );
    res.json({ ...principal, token, expiresInSeconds: appConfig.jwtExpiresInSeconds });
  });

  app.post("/api/auth/demo", (req, res) => {
    if (!appConfig.auth.demoAllowAllRoles) {
      return res.status(403).json({ error: "Demo mode disabled" });
    }
    // Valid checksummed address so EVM calls (claims, etc.) don't fail ENS resolution.
    // Uses the local dev signer account when configured, else a deterministic valid address.
    const address = appConfig.demoAddress;
    const principal = {
      address,
      demo: true,
      roles: ["admin", "doctor", "insurer", "patient", "pharmacy"],
      patientId: appConfig.auth.demoIdentity.patientId !== "*" ? appConfig.auth.demoIdentity.patientId : "PAT-001",
      doctorId: appConfig.auth.demoIdentity.doctorId !== "*" ? appConfig.auth.demoIdentity.doctorId : "DOC-007",
      pharmacyId: appConfig.auth.demoIdentity.pharmacyId !== "*" ? appConfig.auth.demoIdentity.pharmacyId : "PHARM-001",
      insurerId: appConfig.auth.demoIdentity.insurerId !== "*" ? appConfig.auth.demoIdentity.insurerId : "INS-001",
    };
    const token = signJwt(
      { sub: address, address, demo: true, roles: principal.roles, patientId: principal.patientId, doctorId: principal.doctorId, pharmacyId: principal.pharmacyId, insurerId: principal.insurerId },
      appConfig.jwtSecret,
      appConfig.jwtExpiresInSeconds,
      jwtOptions(appConfig)
    );
    res.json({ ...principal, token, expiresInSeconds: appConfig.jwtExpiresInSeconds });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ address: req.auth.address, subject: req.auth.sub, roles: req.auth.roles || [] });
  });

  app.get("/api/fabric/status", (req, res) => {
    res.json(fabric.status());
  });

  app.post("/api/fabric/patients", requireRoles("patient", "admin"), asyncHandler(async (req, res) => {
    if (!req.auth.roles.includes("admin") && req.body.walletAddress && !ethers.isAddress(req.body.walletAddress)) {
      throw forbidden("Invalid patient wallet address");
    }
    if (!req.auth.roles.includes("admin") && req.body.walletAddress && ethers.getAddress(req.body.walletAddress) !== req.auth.address) {
      throw forbidden("Patient wallet must match authenticated wallet");
    }
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.patientRegistry,
      "RegisterPatient",
      [JSON.stringify(req.body)]
    );
    res.status(201).json({ result });
  }));

  app.get("/api/fabric/patients", requireRoles("admin"), asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(appConfig.fabric.chaincodes.patientRegistry, "GetAllPatients");
    res.json({ result });
  }));

  app.get("/api/fabric/patients/wallet/:walletAddress", requireRoles("admin", "insurer"), asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.patientRegistry,
      "GetPatientsByWallet",
      [req.params.walletAddress]
    );
    res.json({ result });
  }));

  app.get("/api/fabric/patients/did/:did", requireRoles("admin", "insurer"), asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.patientRegistry,
      "GetPatientsByDID",
      [req.params.did]
    );
    res.json({ result });
  }));

  app.get("/api/fabric/patients/:patientId/consents", requireAuth, asyncHandler(async (req, res) => {
    const { patient, consents } = await getPatientAccessContext(fabric, appConfig.fabric.chaincodes, req.params.patientId);
    assertPatientAccess(req.auth, patient, consents, "consent:read");
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.patientRegistry,
      "GetPatientConsents",
      [req.params.patientId]
    );
    res.json({ result });
  }));

  app.post("/api/fabric/patients/:patientId/consents", requireAuth, asyncHandler(async (req, res) => {
    const { patient, consents } = await getPatientAccessContext(fabric, appConfig.fabric.chaincodes, req.params.patientId);
    assertPatientAccess(req.auth, patient, consents, "consent:write");
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.patientRegistry,
      "GrantConsent",
      [
        req.params.patientId,
        requiredString(req.body.granteeId, "granteeId"),
        requiredString(req.body.scope, "scope"),
        requiredString(req.body.expiresAt, "expiresAt"),
      ]
    );
    res.status(201).json({ result });
  }));

  app.delete("/api/fabric/patients/:patientId/consents/:consentId", requireAuth, asyncHandler(async (req, res) => {
    const { patient, consents } = await getPatientAccessContext(fabric, appConfig.fabric.chaincodes, req.params.patientId);
    assertPatientAccess(req.auth, patient, consents, "consent:write");
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.patientRegistry,
      "RevokeConsent",
      [req.params.patientId, req.params.consentId]
    );
    res.json({ result });
  }));

  app.get("/api/fabric/patients/:patientId", requireAuth, asyncHandler(async (req, res) => {
    const { patient, consents } = await getPatientAccessContext(fabric, appConfig.fabric.chaincodes, req.params.patientId);
    assertPatientAccess(req.auth, patient, consents);
    res.json({ result: patient });
  }));

  app.put("/api/fabric/patients/:patientId", requireAuth, asyncHandler(async (req, res) => {
    const { patient, consents } = await getPatientAccessContext(fabric, appConfig.fabric.chaincodes, req.params.patientId);
    assertPatientAccess(req.auth, patient, consents, "patient:write");
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.patientRegistry,
      "UpdatePatient",
      [JSON.stringify({ ...req.body, patientId: req.params.patientId })]
    );
    res.json({ result });
  }));

  app.delete("/api/fabric/patients/:patientId/deactivate", requireAuth, asyncHandler(async (req, res) => {
    const { patient, consents } = await getPatientAccessContext(fabric, appConfig.fabric.chaincodes, req.params.patientId);
    assertPatientAccess(req.auth, patient, consents, "patient:write");
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.patientRegistry,
      "DeactivatePatient",
      [req.params.patientId]
    );
    res.json({ result });
  }));

  app.post("/api/fabric/records", requireRoles("doctor", "admin"), asyncHandler(async (req, res) => {
    assertActorId(req.auth, "doctor", req.body.doctorId, "doctorId");
    const body = { ...req.body };
    if (!body.recordId) body.recordId = `REC-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    if (!body.ipfsCid) body.ipfsCid = "QmMock";
    if (!body.fileHashSHA256) body.fileHashSHA256 = `sha256:${crypto.randomBytes(16).toString("hex")}`;
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.medicalRecord,
      "CreateMedicalRecord",
      [JSON.stringify(body)]
    );
    res.status(201).json({ result });
  }));

  app.get("/api/fabric/records/patient/:patientId/type/:recordType", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.medicalRecord,
      "GetRecordsByType",
      [req.params.patientId, req.params.recordType]
    );
    res.json({ result: filterAccessible(result, (record) => canAccessRecord(req.auth, record)) });
  }));

  app.get("/api/fabric/records/patient/:patientId", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.medicalRecord,
      "GetRecordsByPatient",
      [req.params.patientId]
    );
    res.json({ result: filterAccessible(result, (record) => canAccessRecord(req.auth, record)) });
  }));

  app.get("/api/fabric/records/doctor/:doctorId", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.medicalRecord,
      "GetRecordsByDoctor",
      [req.params.doctorId]
    );
    res.json({ result: filterAccessible(result, (record) => canAccessRecord(req.auth, record)) });
  }));

  app.get("/api/fabric/records/:recordId/history", requireAuth, asyncHandler(async (req, res) => {
    const record = await fabric.evaluate(appConfig.fabric.chaincodes.medicalRecord, "GetMedicalRecord", [req.params.recordId]);
    assertRecordAccess(req.auth, record);
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.medicalRecord,
      "GetRecordHistory",
      [req.params.recordId]
    );
    res.json({ result });
  }));

  app.post("/api/fabric/records/:recordId/verify-integrity", requireAuth, asyncHandler(async (req, res) => {
    const record = await fabric.evaluate(appConfig.fabric.chaincodes.medicalRecord, "GetMedicalRecord", [req.params.recordId]);
    assertRecordAccess(req.auth, record);
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.medicalRecord,
      "VerifyRecordIntegrity",
      [req.params.recordId, requiredString(req.body.expectedFileHash, "expectedFileHash")]
    );
    res.json({ result });
  }));

  app.post("/api/fabric/records/:recordId/link-claim", requireRoles("insurer", "admin"), asyncHandler(async (req, res) => {
    const record = await fabric.evaluate(appConfig.fabric.chaincodes.medicalRecord, "GetMedicalRecord", [req.params.recordId]);
    assertRecordAccess(req.auth, record);
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.medicalRecord,
      "LinkRecordToClaim",
      [req.params.recordId, JSON.stringify(req.body)]
    );
    res.json({ result });
  }));

  app.patch("/api/fabric/records/:recordId/revoke", requireRoles("doctor", "admin"), asyncHandler(async (req, res) => {
    const record = await fabric.evaluate(appConfig.fabric.chaincodes.medicalRecord, "GetMedicalRecord", [req.params.recordId]);
    assertRecordAccess(req.auth, record);
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.medicalRecord,
      "RevokeMedicalRecord",
      [req.params.recordId, requiredString(req.body.reasonHash, "reasonHash")]
    );
    res.json({ result });
  }));

  app.get("/api/fabric/records/:recordId", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.medicalRecord,
      "GetMedicalRecord",
      [req.params.recordId]
    );
    assertRecordAccess(req.auth, result);
    res.json({ result });
  }));

  app.put("/api/fabric/records/:recordId", requireRoles("doctor", "admin"), asyncHandler(async (req, res) => {
    const record = await fabric.evaluate(appConfig.fabric.chaincodes.medicalRecord, "GetMedicalRecord", [req.params.recordId]);
    assertRecordAccess(req.auth, record);
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.medicalRecord,
      "UpdateMedicalRecordMetadata",
      [JSON.stringify({ ...req.body, recordId: req.params.recordId })]
    );
    res.json({ result });
  }));

  app.post("/api/fabric/prescriptions", requireRoles("doctor", "admin"), asyncHandler(async (req, res) => {
    assertActorId(req.auth, "doctor", req.body.doctorId, "doctorId");
    const body = { ...req.body };
    if (!body.prescriptionId) body.prescriptionId = `RX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.prescription,
      "CreatePrescription",
      [JSON.stringify(body)]
    );
    res.status(201).json({ result });
  }));

  app.get("/api/fabric/prescriptions/patient/:patientId/active", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.prescription,
      "GetActivePrescriptionsByPatient",
      [req.params.patientId]
    );
    res.json({ result: filterAccessible(result, (prescription) => canAccessPrescription(req.auth, prescription)) });
  }));

  app.get("/api/fabric/prescriptions/patient/:patientId", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.prescription,
      "GetPrescriptionsByPatient",
      [req.params.patientId]
    );
    res.json({ result: filterAccessible(result, (prescription) => canAccessPrescription(req.auth, prescription)) });
  }));

  app.get("/api/fabric/prescriptions/doctor/:doctorId", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.prescription,
      "GetPrescriptionsByDoctor",
      [req.params.doctorId]
    );
    res.json({ result: filterAccessible(result, (prescription) => canAccessPrescription(req.auth, prescription)) });
  }));

  app.get("/api/fabric/prescriptions/pharmacy/:pharmacyId", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.prescription,
      "GetPrescriptionsByPharmacy",
      [req.params.pharmacyId]
    );
    res.json({ result: filterAccessible(result, (prescription) => canAccessPrescription(req.auth, prescription)) });
  }));

  app.post("/api/fabric/prescriptions/:prescriptionId/verify-signature", requireAuth, asyncHandler(async (req, res) => {
    const prescription = await fabric.evaluate(appConfig.fabric.chaincodes.prescription, "GetPrescription", [req.params.prescriptionId]);
    assertPrescriptionAccess(req.auth, prescription);
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.prescription,
      "VerifyPrescriptionSignature",
      [req.params.prescriptionId, requiredString(req.body.expectedSignatureHash, "expectedSignatureHash")]
    );
    res.json({ result });
  }));

  app.patch("/api/fabric/prescriptions/:prescriptionId/status", requireRoles("doctor", "admin"), asyncHandler(async (req, res) => {
    const prescription = await fabric.evaluate(appConfig.fabric.chaincodes.prescription, "GetPrescription", [req.params.prescriptionId]);
    assertPrescriptionAccess(req.auth, prescription);
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.prescription,
      "UpdatePrescriptionStatus",
      [req.params.prescriptionId, requiredString(req.body.status, "status")]
    );
    res.json({ result });
  }));

  app.patch("/api/fabric/prescriptions/:prescriptionId/dispense", requireRoles("pharmacy", "admin"), asyncHandler(async (req, res) => {
    assertActorId(req.auth, "pharmacy", req.body.pharmacyId, "pharmacyId");
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.prescription,
      "DispensePrescription",
      [req.params.prescriptionId, requiredString(req.body.pharmacyId, "pharmacyId")]
    );
    res.json({ result });
  }));

  app.patch("/api/fabric/prescriptions/:prescriptionId/cancel", requireRoles("doctor", "admin"), asyncHandler(async (req, res) => {
    const prescription = await fabric.evaluate(appConfig.fabric.chaincodes.prescription, "GetPrescription", [req.params.prescriptionId]);
    assertPrescriptionAccess(req.auth, prescription);
    const result = await fabric.submit(
      appConfig.fabric.chaincodes.prescription,
      "CancelPrescription",
      [req.params.prescriptionId, requiredString(req.body.reasonHash, "reasonHash")]
    );
    res.json({ result });
  }));

  app.get("/api/fabric/prescriptions/:prescriptionId", requireAuth, asyncHandler(async (req, res) => {
    const result = await fabric.evaluate(
      appConfig.fabric.chaincodes.prescription,
      "GetPrescription",
      [req.params.prescriptionId]
    );
    assertPrescriptionAccess(req.auth, result);
    res.json({ result });
  }));

  app.get("/api/ipfs/status", asyncHandler(async (req, res) => {
    try {
      const version = await ipfs.version();
      res.json({ apiUrl: appConfig.ipfs.apiUrl, gatewayUrl: appConfig.ipfs.gatewayUrl, connected: true, version });
    } catch (error) {
      res.json({
        apiUrl: appConfig.ipfs.apiUrl,
        gatewayUrl: appConfig.ipfs.gatewayUrl,
        connected: false,
        error: error.message,
      });
    }
  }));

  app.post("/api/ipfs/files/hash", asyncHandler(async (req, res) => {
    const fileBuffer = decodeBase64Field(req.body, "fileBase64", appConfig.security.maxBase64Bytes);
    res.json({ fileHash: ipfs.calculateSHA256(fileBuffer) });
  }));

  app.post("/api/ipfs/files/verify", asyncHandler(async (req, res) => {
    const fileBuffer = decodeBase64Field(req.body, "fileBase64", appConfig.security.maxBase64Bytes);
    const expectedHash = requiredString(req.body.expectedHash, "expectedHash");
    res.json({ valid: ipfs.verifyFileHash(fileBuffer, expectedHash) });
  }));

  app.post("/api/ipfs/encrypted-files", requireAuth, asyncHandler(async (req, res) => {
    const fileBuffer = decodeBase64Field(req.body, "fileBase64", appConfig.security.maxBase64Bytes);
    const metadata = req.body.metadata || {};
    const result = await ipfs.uploadEncryptedFile(fileBuffer, metadata);
    res.status(201).json({ result });
  }));

  app.get("/api/ipfs/files/:cid", requireRoles("patient", "doctor", "admin"), asyncHandler(async (req, res) => {
    const file = await ipfs.getFile(req.params.cid);
    res.json({ cid: req.params.cid, fileBase64: file.toString("base64"), size: file.length });
  }));

  app.post("/api/ipfs/files/:cid/pin", requireAuth, asyncHandler(async (req, res) => {
    const result = await ipfs.pinFile(req.params.cid);
    res.json({ result });
  }));

  app.get("/api/reimbursement/balance", asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const balance = await contracts.provider.getBalance(appConfig.reimbursementAddress);
    res.json({ address: appConfig.reimbursementAddress, balanceWei: balance.toString(), balanceEth: ethers.formatEther(balance) });
  }));

  app.post("/api/reimbursement/fund", requireRoles("insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const amount = parseAmount(req.body);
    const { tx, receipt } = await waitFor(contracts.signer.sendTransaction({
      to: appConfig.reimbursementAddress,
      value: amount,
    }));
    res.json({ transaction: txSummary(tx, receipt) });
  }));

  app.get("/api/reimbursement/claims/count", asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const count = await contracts.reimbursement.totalClaims();
    res.json({ count: count.toString() });
  }));

  app.post("/api/reimbursement/claims/tx", requireRoles("patient", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const amount = parseAmount(req.body);
    const fabricValidation = await validateClaimWithFabric(fabric, appConfig.fabric.chaincodes, req.body);
    if (fabricValidation?.patient) assertPatientAccess(req.auth, fabricValidation.patient);
    if (fabricValidation?.medicalRecord) assertRecordAccess(req.auth, fabricValidation.medicalRecord);
    const tx = await contracts.reimbursement.submitClaim.populateTransaction(amount);
    res.json({
      from: req.auth.address,
      to: appConfig.reimbursementAddress,
      data: tx.data,
      value: "0",
      fabricValidation,
    });
  }));

  app.post("/api/reimbursement/claims", requireRoles("patient", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const amount = parseAmount(req.body);
    const fabricValidation = await validateClaimWithFabric(fabric, appConfig.fabric.chaincodes, req.body);
    if (fabricValidation?.patient) assertPatientAccess(req.auth, fabricValidation.patient);
    if (fabricValidation?.medicalRecord) assertRecordAccess(req.auth, fabricValidation.medicalRecord);
    const txPromise = contracts.reimbursement.submitClaimFor
      ? contracts.reimbursement.submitClaimFor(req.auth.address, amount)
      : contracts.reimbursement.submitClaim(amount);
    const { tx, receipt } = await waitFor(txPromise);
    const event = findEvent(receipt, contracts.reimbursement, "ClaimSubmitted");
    const claimId = event ? event.args.claimId.toString() : null;
    const patient = event ? event.args.patient : req.auth.address;
    let fabricClaimLink = null;

    if (req.body.recordId && claimId !== null) {
      fabricClaimLink = await fabric.submit(
        appConfig.fabric.chaincodes.medicalRecord,
        "LinkRecordToClaim",
        [
          req.body.recordId,
          JSON.stringify({
            claimId,
            reimbursementContractAddress: appConfig.reimbursementAddress,
            patientWallet: patient,
            amountWei: amount.toString(),
            txHash: tx.hash,
            linkedAt: new Date().toISOString(),
            linkedBy: req.auth.address,
          }),
        ]
      );
    }

    res.status(201).json({
      claimId,
      patient,
      amountWei: amount.toString(),
      fabricValidation,
      fabricClaimLink,
      transaction: txSummary(tx, receipt),
    });
  }));

  app.get("/api/reimbursement/claims/:claimId", requireRoles("patient", "insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const [id, patient, amount, approved, paid] = await contracts.reimbursement.getClaim(req.params.claimId);
    if (!req.auth.roles.includes("admin") && !req.auth.roles.includes("insurer") && ethers.getAddress(patient) !== req.auth.address) {
      throw forbidden("Not allowed to access this reimbursement claim");
    }
    res.json({
      id: id.toString(),
      patient,
      amountWei: amount.toString(),
      approved,
      paid,
    });
  }));

  app.post("/api/reimbursement/claims/:claimId/validate", requireRoles("insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const { tx, receipt } = await waitFor(contracts.reimbursement.validateClaim(req.params.claimId));
    res.json({ claimId: String(req.params.claimId), transaction: txSummary(tx, receipt) });
  }));

  app.post("/api/reimbursement/claims/:claimId/pay", requireRoles("insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const { tx, receipt } = await waitFor(contracts.reimbursement.executePayment(req.params.claimId));
    res.json({ claimId: String(req.params.claimId), transaction: txSummary(tx, receipt) });
  }));

  app.get("/api/reimbursement/events/submitted", requireRoles("insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const { fromBlock, toBlock } = readBlockRange(req.query, appConfig.security.eventBlockLimit);
    const logs = await contracts.reimbursement.queryFilter(contracts.reimbursement.filters.ClaimSubmitted(), fromBlock, toBlock);
    res.json({ events: logs.map((log) => formatEvent(log, contracts.reimbursement)) });
  }));

  app.get("/api/reimbursement/events/approved", requireRoles("insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const { fromBlock, toBlock } = readBlockRange(req.query, appConfig.security.eventBlockLimit);
    const logs = await contracts.reimbursement.queryFilter(contracts.reimbursement.filters.ClaimApproved(), fromBlock, toBlock);
    res.json({ events: logs.map((log) => formatEvent(log, contracts.reimbursement)) });
  }));

  app.get("/api/reimbursement/events/payments", requireRoles("insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.reimbursement, "ReimbursementContract");
    const { fromBlock, toBlock } = readBlockRange(req.query, appConfig.security.eventBlockLimit);
    const logs = await contracts.reimbursement.queryFilter(contracts.reimbursement.filters.PaymentExecuted(), fromBlock, toBlock);
    res.json({ events: logs.map((log) => formatEvent(log, contracts.reimbursement)) });
  }));

  app.post("/api/drugs", requireRoles("admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const { batchId, name, manufacturer } = req.body;
    const { tx, receipt } = await waitFor(contracts.drugTraceability.registerDrug(batchId, name, manufacturer));
    res.status(201).json({ batchId, transaction: txSummary(tx, receipt) });
  }));

  app.post("/api/drugs/updaters/:address", requireRoles("admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const account = normaliseAddress(req.params.address);
    const authorised = Boolean(req.body.authorised);
    const { tx, receipt } = await waitFor(contracts.drugTraceability.setUpdaterAuthorisation(account, authorised));
    res.json({ account, authorised, transaction: txSummary(tx, receipt) });
  }));

  app.get("/api/drugs/updaters/:address", asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const account = normaliseAddress(req.params.address);
    const authorised = await contracts.drugTraceability.isAuthorisedUpdater(account);
    res.json({ account, authorised });
  }));

  app.post("/api/drugs/:batchId/status", requireRoles("pharmacy", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const { tx, receipt } = await waitFor(contracts.drugTraceability.updateStatus(req.params.batchId, req.body.status));
    res.json({ batchId: req.params.batchId, status: req.body.status, transaction: txSummary(tx, receipt) });
  }));

  app.get("/api/drugs/:batchId", asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const [name, manufacturer, historyCount] = await contracts.drugTraceability.verifyDrug(req.params.batchId);
    res.json({
      batchId: req.params.batchId,
      name,
      manufacturer,
      historyCount: historyCount.toString(),
    });
  }));

  app.get("/api/drugs/:batchId/history", asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const [timestamps, statuses, updaters] = await contracts.drugTraceability.getDrugHistory(req.params.batchId);
    res.json({
      batchId: req.params.batchId,
      history: statuses.map((status, index) => ({
        timestamp: timestamps[index].toString(),
        status,
        updatedBy: updaters[index],
      })),
    });
  }));

  app.get("/api/drugs/events/registered", requireRoles("pharmacy", "insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const { fromBlock, toBlock } = readBlockRange(req.query, appConfig.security.eventBlockLimit);
    const logs = await contracts.drugTraceability.queryFilter(
      contracts.drugTraceability.filters.DrugRegistered(),
      fromBlock,
      toBlock
    );
    res.json({ events: logs.map((log) => formatEvent(log, contracts.drugTraceability)) });
  }));

  app.get("/api/drugs/events/updated", requireRoles("pharmacy", "insurer", "admin"), asyncHandler(async (req, res) => {
    ensureContract(contracts.drugTraceability, "DrugTraceabilityContract");
    const { fromBlock, toBlock } = readBlockRange(req.query, appConfig.security.eventBlockLimit);
    const logs = await contracts.drugTraceability.queryFilter(
      contracts.drugTraceability.filters.DrugUpdated(),
      fromBlock,
      toBlock
    );
    res.json({ events: logs.map((log) => formatEvent(log, contracts.drugTraceability)) });
  }));

  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.shortMessage || error.reason || error.message });
  });

  return app;
}

async function startServer(appConfig = config) {
  let contracts;
  try {
    contracts = await createContractContext(appConfig);
  } catch (err) {
    console.warn(`[blockchain] Unavailable (${err.message}) — contract endpoints disabled, auth/fabric/ipfs still active`);
    contracts = { provider: null, signer: null, reimbursement: null, drugTraceability: null };
  }
  const fabric = appConfig.fabric.mode === "sdk"
    ? new FabricGatewayService(appConfig.fabric)
    : new FabricMockService(appConfig.fabric);
  const ipfs = new MedichainIpfsClient(appConfig.ipfs.apiUrl, {
    timeoutMs: appConfig.security.ipfsTimeoutMs,
    maxFileBytes: appConfig.security.maxBase64Bytes,
  });
  const app = createApp({ appConfig, contracts, fabric, ipfs });
  app.listen(appConfig.apiPort, process.env.API_HOST || "127.0.0.1", () => {
    console.log(`MediChain+ API Gateway listening on http://127.0.0.1:${appConfig.apiPort}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start MediChain+ API Gateway");
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  startServer,
  createAuthMiddleware,
  decodeBase64Field,
};
