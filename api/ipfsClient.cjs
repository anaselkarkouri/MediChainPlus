"use strict";

const crypto = require("crypto");

function ensureFetch() {
  if (typeof fetch !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
    const error = new Error("Node.js 20.9+ fetch/FormData APIs are required for IPFS calls");
    error.statusCode = 500;
    throw error;
  }
}

function parseIpfsText(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] || "{}";
  return JSON.parse(last);
}

class MedichainIpfsClient {
  constructor(apiUrl, options = {}) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs || 15000;
    this.maxFileBytes = options.maxFileBytes || 5 * 1024 * 1024;
  }

  calculateSHA256(fileBuffer) {
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  }

  verifyFileHash(fileBuffer, expectedHash) {
    return this.calculateSHA256(fileBuffer) === expectedHash;
  }

  async version() {
    const result = await this.call("version", { method: "POST" });
    return result;
  }

  async uploadEncryptedFile(fileBuffer, metadata) {
    if (metadata.encryptionAlgorithm !== "AES-256-GCM") {
      const error = new Error("Only AES-256-GCM encrypted files are allowed");
      error.statusCode = 400;
      throw error;
    }
    if (!metadata.iv || !metadata.tag || !metadata.ownerPatientId) {
      const error = new Error("iv, tag and ownerPatientId are required");
      error.statusCode = 400;
      throw error;
    }

    const fileHash = this.calculateSHA256(fileBuffer);
    const fileAdd = await this.addBytes(fileBuffer, metadata.fileName || "encrypted-medical-file.bin");
    const finalMetadata = {
      ...metadata,
      cid: fileAdd.Hash,
      fileHash,
      createdAt: new Date().toISOString(),
    };
    const metadataAdd = await this.addBytes(
      Buffer.from(JSON.stringify(finalMetadata)),
      "metadata.json"
    );

    return {
      ...finalMetadata,
      metadataCid: metadataAdd.Hash,
    };
  }

  async addBytes(fileBuffer, fileName) {
    ensureFetch();
    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), fileName);
    return this.call("add", {
      method: "POST",
      query: { pin: "true" },
      body: form,
    });
  }

  async getFile(cid) {
    validateCid(cid);
    const response = await this.rawCall("cat", {
      method: "POST",
      query: { arg: cid },
    });
    return readResponseBuffer(response, this.maxFileBytes);
  }

  async pinFile(cid) {
    validateCid(cid);
    return this.call("pin/add", {
      method: "POST",
      query: { arg: cid },
    });
  }

  async call(command, options = {}) {
    const response = await this.rawCall(command, options);
    const text = await response.text();
    return text ? parseIpfsText(text) : { ok: true };
  }

  async rawCall(command, options = {}) {
    ensureFetch();
    const url = new URL(`${this.apiUrl}/api/v0/${command}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method: options.method || "POST",
        body: options.body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error("IPFS request timed out");
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const error = new Error(`IPFS request failed: ${response.status} ${await response.text()}`);
      error.statusCode = 502;
      throw error;
    }
    return response;
  }
}

function validateCid(cid) {
  if (!/^[a-zA-Z0-9]+$/.test(String(cid || "")) || String(cid).length > 128) {
    const error = new Error("Invalid IPFS CID");
    error.statusCode = 400;
    throw error;
  }
}

async function readResponseBuffer(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      const error = new Error("IPFS file exceeds maximum allowed size");
      error.statusCode = 413;
      throw error;
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      reader.cancel().catch(() => {});
      const error = new Error("IPFS file exceeds maximum allowed size");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

module.exports = {
  MedichainIpfsClient,
  validateCid,
};
