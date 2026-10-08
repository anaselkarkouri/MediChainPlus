"use strict";

const crypto = require("crypto");

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function signPart(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function parseJsonPart(value, label) {
  try {
    return JSON.parse(base64UrlDecode(value));
  } catch {
    throw new Error(`Invalid token ${label}`);
  }
}

function signJwt(payload, secret, expiresInSeconds, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  if (options.issuer) body.iss = options.issuer;
  if (options.audience) body.aud = options.audience;

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const unsignedToken = `${encodedHeader}.${encodedBody}`;
  return `${unsignedToken}.${signPart(unsignedToken, secret)}`;
}

function verifyJwt(token, secret, options = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [encodedHeader, encodedBody, signature] = parts;
  const header = parseJsonPart(encodedHeader, "header");
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Invalid token header");
  }

  const unsignedToken = `${encodedHeader}.${encodedBody}`;
  const expected = signPart(unsignedToken, secret);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid token signature");
  }

  const payload = parseJsonPart(encodedBody, "payload");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) {
    throw new Error("Invalid token lifetime");
  }
  if (payload.exp < now) {
    throw new Error("Token expired");
  }
  if (payload.iat > now + 60) {
    throw new Error("Token issued in the future");
  }
  if (options.issuer && payload.iss !== options.issuer) {
    throw new Error("Invalid token issuer");
  }
  if (options.audience && payload.aud !== options.audience) {
    throw new Error("Invalid token audience");
  }
  return payload;
}

module.exports = {
  signJwt,
  verifyJwt,
};
