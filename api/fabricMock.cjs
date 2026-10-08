"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureString(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return String(value);
}

class FabricMockService {
  constructor(config) {
    this.config = config;
    this.storePath = config.mockStorePath;
    this.store = this.loadStore();
  }

  status() {
    return {
      mode: "mock",
      connectionProfilePath: this.config.connectionProfilePath,
      connectionProfileExists: fs.existsSync(this.config.connectionProfilePath),
      walletPath: this.config.walletPath,
      walletExists: true,
      identity: this.config.identity,
      channelName: this.config.channelName,
      chaincodes: this.config.chaincodes,
      connected: true,
      mockStorePath: this.storePath,
    };
  }

  async evaluate(chaincodeName, functionName, args = []) {
    return this.dispatch(chaincodeName, functionName, args, false);
  }

  async submit(chaincodeName, functionName, args = []) {
    const result = this.dispatch(chaincodeName, functionName, args, true);
    this.saveStore();
    return result;
  }

  disconnect() {}

  loadStore() {
    if (!fs.existsSync(this.storePath)) {
      // Auto-seed from the committed seed file if the local store doesn't exist yet.
      const seedPath = path.join(path.dirname(this.storePath), "fabric-mock.json");
      if (fs.existsSync(seedPath)) {
        fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
        fs.copyFileSync(seedPath, this.storePath);
      } else {
        return { patients: {}, medicalRecords: {}, prescriptions: {} };
      }
    }
    return JSON.parse(fs.readFileSync(this.storePath, "utf8"));
  }

  saveStore() {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
  }

  dispatch(chaincodeName, functionName, args, isSubmit) {
    if (chaincodeName === this.config.chaincodes.patientRegistry) {
      return this.patient(functionName, args, isSubmit);
    }
    if (chaincodeName === this.config.chaincodes.medicalRecord) {
      return this.record(functionName, args, isSubmit);
    }
    if (chaincodeName === this.config.chaincodes.prescription) {
      return this.prescription(functionName, args, isSubmit);
    }
    throw new Error(`Unknown mock chaincode: ${chaincodeName}`);
  }

  patient(functionName, args) {
    switch (functionName) {
      case "RegisterPatient": {
        const payload = JSON.parse(args[0]);
        const patientId = ensureString(payload.patientId, "patientId");
        if (this.store.patients[patientId]) {
          throw new Error(`Patient ${patientId} already exists`);
        }
        const patient = {
          objectType: "patient",
          allergies: [],
          consentReferences: [],
          ...payload,
          status: "ACTIVE",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdBy: this.config.identity,
        };
        ensureString(patient.did, "did");
        ensureString(patient.walletAddress, "walletAddress");
        this.store.patients[patientId] = patient;
        return clone(patient);
      }
      case "GetPatient": {
        const patient = this.store.patients[args[0]];
        if (!patient) {
          throw new Error(`Patient ${args[0]} not found`);
        }
        return clone(patient);
      }
      case "UpdatePatient": {
        const payload = JSON.parse(args[0]);
        const patientId = ensureString(payload.patientId, "patientId");
        const existing = this.store.patients[patientId];
        if (!existing) {
          throw new Error(`Patient ${patientId} not found`);
        }
        this.store.patients[patientId] = { ...existing, ...payload, updatedAt: nowIso() };
        return clone(this.store.patients[patientId]);
      }
      case "DeactivatePatient": {
        const patient = this.store.patients[args[0]];
        if (!patient) {
          throw new Error(`Patient ${args[0]} not found`);
        }
        patient.status = "INACTIVE";
        patient.updatedAt = nowIso();
        return clone(patient);
      }
      case "PatientExists":
        return Boolean(this.store.patients[args[0]]);
      case "GetAllPatients":
        return Object.values(this.store.patients).map(clone);
      case "GetPatientsByWallet":
        return Object.values(this.store.patients)
          .filter((patient) => String(patient.walletAddress).toLowerCase() === String(args[0]).toLowerCase())
          .map(clone);
      case "GetPatientsByDID":
        return Object.values(this.store.patients)
          .filter((patient) => patient.did === args[0])
          .map(clone);
      case "GrantConsent": {
        const patient = this.store.patients[args[0]];
        if (!patient) {
          throw new Error(`Patient ${args[0]} not found`);
        }
        const consent = {
          consentId: `CONSENT-${crypto.randomBytes(4).toString("hex")}`,
          patientId: args[0],
          granteeId: ensureString(args[1], "granteeId"),
          scope: ensureString(args[2], "scope"),
          grantedAt: nowIso(),
          expiresAt: ensureString(args[3], "expiresAt"),
          revoked: false,
          createdBy: this.config.identity,
        };
        patient.consentReferences = patient.consentReferences || [];
        patient.consents = patient.consents || [];
        patient.consentReferences.push(consent.consentId);
        patient.consents.push(consent);
        patient.updatedAt = nowIso();
        return clone(consent);
      }
      case "RevokeConsent": {
        const patient = this.store.patients[args[0]];
        if (!patient || !patient.consents) {
          throw new Error(`Consent ${args[1]} not found`);
        }
        const consent = patient.consents.find((item) => item.consentId === args[1]);
        if (!consent) {
          throw new Error(`Consent ${args[1]} not found`);
        }
        consent.revoked = true;
        consent.revokedAt = nowIso();
        patient.updatedAt = nowIso();
        return clone(consent);
      }
      case "GetPatientConsents": {
        const patient = this.store.patients[args[0]];
        if (!patient) {
          throw new Error(`Patient ${args[0]} not found`);
        }
        return clone(patient.consents || []);
      }
      default:
        throw new Error(`Unsupported patient-registry mock function: ${functionName}`);
    }
  }

  record(functionName, args) {
    switch (functionName) {
      case "CreateMedicalRecord": {
        const payload = JSON.parse(args[0]);
        const recordId = ensureString(payload.recordId, "recordId");
        if (this.store.medicalRecords[recordId]) {
          throw new Error(`Medical record ${recordId} already exists`);
        }
        const record = {
          objectType: "medicalRecord",
          ...payload,
          status: "ACTIVE",
          claimReferences: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdBy: this.config.identity,
        };
        ensureString(record.patientId, "patientId");
        ensureString(record.doctorId, "doctorId");
        ensureString(record.ipfsCid, "ipfsCid");
        ensureString(record.fileHashSHA256, "fileHashSHA256");
        this.store.medicalRecords[recordId] = record;
        return clone(record);
      }
      case "GetMedicalRecord": {
        const record = this.store.medicalRecords[args[0]];
        if (!record) {
          throw new Error(`Medical record ${args[0]} not found`);
        }
        return clone(record);
      }
      case "UpdateMedicalRecordMetadata": {
        const payload = JSON.parse(args[0]);
        const recordId = ensureString(payload.recordId, "recordId");
        const existing = this.store.medicalRecords[recordId];
        if (!existing) {
          throw new Error(`Medical record ${recordId} not found`);
        }
        this.store.medicalRecords[recordId] = { ...existing, ...payload, updatedAt: nowIso() };
        return clone(this.store.medicalRecords[recordId]);
      }
      case "RevokeMedicalRecord": {
        const record = this.store.medicalRecords[args[0]];
        if (!record) {
          throw new Error(`Medical record ${args[0]} not found`);
        }
        record.status = "REVOKED";
        record.revocationReasonHash = ensureString(args[1], "reasonHash");
        record.updatedAt = nowIso();
        return clone(record);
      }
      case "MedicalRecordExists":
        return Boolean(this.store.medicalRecords[args[0]]);
      case "GetRecordsByPatient":
        return Object.values(this.store.medicalRecords).filter((record) => record.patientId === args[0]).map(clone);
      case "GetRecordsByDoctor":
        return Object.values(this.store.medicalRecords).filter((record) => record.doctorId === args[0]).map(clone);
      case "GetRecordsByType":
        return Object.values(this.store.medicalRecords)
          .filter((record) => record.patientId === args[0] && record.recordType === args[1])
          .map(clone);
      case "GetRecordHistory":
        return [clone(this.store.medicalRecords[args[0]])].filter(Boolean);
      case "VerifyRecordIntegrity": {
        const record = this.store.medicalRecords[args[0]];
        if (!record) {
          throw new Error(`Medical record ${args[0]} not found`);
        }
        return {
          recordId: args[0],
          valid: record.fileHashSHA256 === args[1],
          storedHash: record.fileHashSHA256,
          expectedHash: args[1],
        };
      }
      case "LinkRecordToClaim": {
        const record = this.store.medicalRecords[args[0]];
        if (!record) {
          throw new Error(`Medical record ${args[0]} not found`);
        }
        const ref = JSON.parse(args[1]);
        record.claimReferences = record.claimReferences || [];
        record.claimReferences.push({
          ...ref,
          linkedAt: ref.linkedAt || nowIso(),
          linkedBy: ref.linkedBy || this.config.identity,
        });
        record.updatedAt = nowIso();
        return clone(record);
      }
      default:
        throw new Error(`Unsupported medical-record mock function: ${functionName}`);
    }
  }

  prescription(functionName, args) {
    switch (functionName) {
      case "CreatePrescription": {
        const payload = JSON.parse(args[0]);
        const prescriptionId = ensureString(payload.prescriptionId, "prescriptionId");
        if (this.store.prescriptions[prescriptionId]) {
          throw new Error(`Prescription ${prescriptionId} already exists`);
        }
        const rx = {
          objectType: "prescription",
          ...payload,
          status: "ACTIVE",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          createdBy: this.config.identity,
        };
        ensureString(rx.patientId, "patientId");
        ensureString(rx.doctorId, "doctorId");
        ensureString(rx.signatureHash, "signatureHash");
        this.store.prescriptions[prescriptionId] = rx;
        return clone(rx);
      }
      case "GetPrescription": {
        const rx = this.store.prescriptions[args[0]];
        if (!rx) {
          throw new Error(`Prescription ${args[0]} not found`);
        }
        return clone(rx);
      }
      case "UpdatePrescriptionStatus": {
        const rx = this.store.prescriptions[args[0]];
        if (!rx) {
          throw new Error(`Prescription ${args[0]} not found`);
        }
        rx.status = ensureString(args[1], "status");
        rx.updatedAt = nowIso();
        return clone(rx);
      }
      case "CancelPrescription": {
        const rx = this.store.prescriptions[args[0]];
        if (!rx) {
          throw new Error(`Prescription ${args[0]} not found`);
        }
        rx.status = "CANCELLED";
        rx.cancellationReasonHash = ensureString(args[1], "reasonHash");
        rx.updatedAt = nowIso();
        return clone(rx);
      }
      case "DispensePrescription": {
        const rx = this.store.prescriptions[args[0]];
        if (!rx) {
          throw new Error(`Prescription ${args[0]} not found`);
        }
        rx.status = "DISPENSED";
        rx.pharmacyId = ensureString(args[1], "pharmacyId");
        rx.dispensedAt = nowIso();
        rx.updatedAt = nowIso();
        return clone(rx);
      }
      case "PrescriptionExists":
        return Boolean(this.store.prescriptions[args[0]]);
      case "GetPrescriptionsByPatient":
        return Object.values(this.store.prescriptions).filter((rx) => rx.patientId === args[0]).map(clone);
      case "GetPrescriptionsByDoctor":
        return Object.values(this.store.prescriptions).filter((rx) => rx.doctorId === args[0]).map(clone);
      case "GetPrescriptionsByPharmacy":
        return Object.values(this.store.prescriptions).filter((rx) => rx.pharmacyId === args[0]).map(clone);
      case "GetActivePrescriptionsByPatient":
        return Object.values(this.store.prescriptions)
          .filter((rx) => rx.patientId === args[0] && rx.status === "ACTIVE")
          .map(clone);
      case "VerifyPrescriptionSignature": {
        const rx = this.store.prescriptions[args[0]];
        if (!rx) {
          throw new Error(`Prescription ${args[0]} not found`);
        }
        return {
          prescriptionId: args[0],
          valid: rx.signatureHash === args[1],
          storedSignatureHash: rx.signatureHash,
          expectedSignatureHash: args[1],
        };
      }
      default:
        throw new Error(`Unsupported prescription mock function: ${functionName}`);
    }
  }
}

module.exports = {
  FabricMockService,
};
