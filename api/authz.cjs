"use strict";

const { ethers } = require("ethers");

const ALL_ROLES = ["admin", "patient", "doctor", "pharmacy", "insurer"];

function forbidden(message = "Forbidden") {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normaliseAddress(address) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid wallet address in auth configuration: ${address}`);
  }
  return ethers.getAddress(address);
}

function parseAddressSet(value) {
  return new Set(splitList(value).map((address) => normaliseAddress(address).toLowerCase()));
}

function parsePrincipals(value) {
  if (!value || !String(value).trim()) {
    return {};
  }

  const parsed = JSON.parse(value);
  return Object.fromEntries(
    Object.entries(parsed).map(([address, principal]) => [
      normaliseAddress(address).toLowerCase(),
      {
        roles: Array.isArray(principal.roles) ? principal.roles.filter((role) => ALL_ROLES.includes(role)) : [],
        patientId: principal.patientId,
        doctorId: principal.doctorId,
        pharmacyId: principal.pharmacyId,
        insurerId: principal.insurerId,
      },
    ])
  );
}

function buildAuthConfig(env = process.env) {
  const demoAllowAllRoles = parseBoolean(
    env.API_DEMO_ALLOW_ALL_ROLES,
    env.NODE_ENV !== "production"
  );

  return {
    demoAllowAllRoles,
    principals: parsePrincipals(env.API_PRINCIPALS),
    roleAddresses: {
      admin: parseAddressSet(env.API_ADMIN_ADDRESSES),
      patient: parseAddressSet(env.API_PATIENT_ADDRESSES),
      doctor: parseAddressSet(env.API_DOCTOR_ADDRESSES),
      pharmacy: parseAddressSet(env.API_PHARMACY_ADDRESSES),
      insurer: parseAddressSet(env.API_INSURER_ADDRESSES),
    },
    demoIdentity: {
      patientId: env.API_DEMO_PATIENT_ID || "*",
      doctorId: env.API_DEMO_DOCTOR_ID || "*",
      pharmacyId: env.API_DEMO_PHARMACY_ID || "*",
      insurerId: env.API_DEMO_INSURER_ID || "*",
    },
  };
}

function principalForAddress(address, authConfig) {
  const normalisedAddress = normaliseAddress(address);
  const key = normalisedAddress.toLowerCase();
  const configured = authConfig.principals[key] || {};
  const roles = new Set(configured.roles || []);

  for (const role of ALL_ROLES) {
    if (authConfig.roleAddresses[role].has(key)) {
      roles.add(role);
    }
  }

  if (authConfig.demoAllowAllRoles && roles.size === 0) {
    for (const role of ALL_ROLES) {
      roles.add(role);
    }
  }

  const identity = authConfig.demoAllowAllRoles
    ? { ...authConfig.demoIdentity, ...configured }
    : configured;

  return {
    address: normalisedAddress,
    roles: [...roles].sort(),
    patientId: identity.patientId,
    doctorId: identity.doctorId,
    pharmacyId: identity.pharmacyId,
    insurerId: identity.insurerId,
  };
}

function hasRole(auth, role) {
  return Array.isArray(auth?.roles) && auth.roles.includes(role);
}

function hasAnyRole(auth, roles) {
  return roles.some((role) => hasRole(auth, role));
}

function assertRole(auth, roles) {
  if (!hasAnyRole(auth, roles)) {
    throw forbidden(`Requires one of roles: ${roles.join(", ")}`);
  }
}

function sameAddress(left, right) {
  return ethers.isAddress(left) && ethers.isAddress(right) && ethers.getAddress(left) === ethers.getAddress(right);
}

function matchesIdentity(actual, expected) {
  return actual === "*" || (actual && expected && String(actual) === String(expected));
}

function hasActiveConsent(consents, granteeId, scope) {
  const now = Date.now();
  return (consents || []).some((consent) => {
    if (consent.revoked || consent.granteeId !== granteeId) {
      return false;
    }
    if (consent.expiresAt && Date.parse(consent.expiresAt) < now) {
      return false;
    }
    return !scope || consent.scope === scope || consent.scope === "*" || String(consent.scope).includes(scope);
  });
}

function canAccessPatient(auth, patient, consents = [], scope = "patient:read") {
  if (hasRole(auth, "admin")) {
    return true;
  }
  if (hasRole(auth, "patient")) {
    return matchesIdentity(auth.patientId, patient.patientId) || sameAddress(auth.address, patient.walletAddress);
  }
  if (hasRole(auth, "doctor") && hasActiveConsent(consents, auth.doctorId, scope)) {
    return true;
  }
  if (hasRole(auth, "insurer") && hasActiveConsent(consents, auth.insurerId, scope)) {
    return true;
  }
  if (hasRole(auth, "pharmacy") && hasActiveConsent(consents, auth.pharmacyId, scope)) {
    return true;
  }
  return false;
}

function canAccessRecord(auth, record) {
  if (hasRole(auth, "admin")) {
    return true;
  }
  if (hasRole(auth, "patient") && matchesIdentity(auth.patientId, record.patientId)) {
    return true;
  }
  const policy = record.accessPolicy || {};
  if (hasRole(auth, "doctor")) {
    return matchesIdentity(auth.doctorId, record.doctorId) ||
      (policy.allowedDoctorIds || []).some((id) => matchesIdentity(auth.doctorId, id));
  }
  if (hasRole(auth, "insurer")) {
    return (policy.allowedInsurerIds || []).some((id) => matchesIdentity(auth.insurerId, id));
  }
  if (hasRole(auth, "pharmacy")) {
    return (policy.allowedPharmacyIds || []).some((id) => matchesIdentity(auth.pharmacyId, id));
  }
  return false;
}

function canAccessPrescription(auth, prescription) {
  if (hasRole(auth, "admin")) {
    return true;
  }
  if (hasRole(auth, "patient") && matchesIdentity(auth.patientId, prescription.patientId)) {
    return true;
  }
  if (hasRole(auth, "doctor") && matchesIdentity(auth.doctorId, prescription.doctorId)) {
    return true;
  }
  if (hasRole(auth, "pharmacy") && matchesIdentity(auth.pharmacyId, prescription.pharmacyId || "*")) {
    return true;
  }
  return false;
}

function assertActorId(auth, role, expectedId, fieldName) {
  if (hasRole(auth, "admin")) {
    return;
  }
  assertRole(auth, [role]);
  const actual = auth[`${role}Id`];
  if (!matchesIdentity(actual, expectedId)) {
    throw forbidden(`${fieldName} does not match authenticated ${role}`);
  }
}

module.exports = {
  ALL_ROLES,
  buildAuthConfig,
  principalForAddress,
  forbidden,
  hasRole,
  hasAnyRole,
  assertRole,
  assertActorId,
  canAccessPatient,
  canAccessRecord,
  canAccessPrescription,
};
