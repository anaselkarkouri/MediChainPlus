import crypto from 'crypto';

export interface EncryptedFileMetadata {
  cid: string;
  fileHash: string;
  encryptionAlgorithm: 'AES-256-GCM';
  iv: string;
  tag: string;
  ownerPatientId: string;
  createdAt: string;
  extra?: Record<string, unknown>;
}

export class MedichainIpfsClient {
  private apiUrl: string;

  constructor(url = process.env.IPFS_API_URL ?? 'http://127.0.0.1:5001') {
    this.apiUrl = url.replace(/\/$/, '');
  }

  calculateSHA256(fileBuffer: Buffer): string {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  verifyFileHash(fileBuffer: Buffer, expectedHash: string): boolean {
    return this.calculateSHA256(fileBuffer) === expectedHash;
  }

  async uploadEncryptedFile(fileBuffer: Buffer, metadata: Omit<EncryptedFileMetadata, 'cid' | 'fileHash' | 'createdAt'>): Promise<EncryptedFileMetadata> {
    if (metadata.encryptionAlgorithm !== 'AES-256-GCM') {
      throw new Error('Only AES-256-GCM encrypted files are allowed');
    }
    if (!metadata.iv || !metadata.tag || !metadata.ownerPatientId) {
      throw new Error('iv, tag and ownerPatientId are required');
    }

    const fileHash = this.calculateSHA256(fileBuffer);
    const addResult = await this.addBytes(fileBuffer, 'encrypted-medical-file.bin');
    const cid = addResult.Hash;
    const finalMetadata: EncryptedFileMetadata = {
      ...metadata,
      cid,
      fileHash,
      createdAt: new Date().toISOString()
    };

    const metadataBytes = Buffer.from(JSON.stringify(finalMetadata));
    await this.addBytes(metadataBytes, 'metadata.json');
    return finalMetadata;
  }

  async getFile(cid: string): Promise<Buffer> {
    const response = await this.rawCall('cat', { query: { arg: cid } });
    return Buffer.from(await response.arrayBuffer());
  }

  async pinFile(cid: string): Promise<void> {
    await this.call('pin/add', { query: { arg: cid } });
  }

  private async addBytes(fileBuffer: Buffer, fileName: string): Promise<{ Hash: string }> {
    ensureFetch();
    const form = new FormData();
    const fileBytes = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer;
    form.append('file', new Blob([fileBytes]), fileName);
    return this.call('add', { query: { pin: 'true' }, body: form });
  }

  private async call(command: string, options: IpfsCallOptions = {}): Promise<any> {
    const response = await this.rawCall(command, options);
    const text = await response.text();
    return text ? parseIpfsText(text) : { ok: true };
  }

  private async rawCall(command: string, options: IpfsCallOptions = {}): Promise<Response> {
    ensureFetch();
    const url = new URL(`${this.apiUrl}/api/v0/${command}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, { method: 'POST', body: options.body });
    if (!response.ok) {
      throw new Error(`IPFS request failed: ${response.status} ${await response.text()}`);
    }
    return response;
  }
}

interface IpfsCallOptions {
  query?: Record<string, string>;
  body?: BodyInit;
}

function ensureFetch(): void {
  if (typeof fetch !== 'function' || typeof FormData !== 'function' || typeof Blob !== 'function') {
    throw new Error('Node.js 18+ fetch/FormData APIs are required for IPFS calls');
  }
}

function parseIpfsText(text: string): any {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines[lines.length - 1] ?? '{}');
}

export function encryptAES256GCM(plain: Buffer, key: Buffer): { encrypted: Buffer; iv: string; tag: string } {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv: iv.toString('hex'), tag: tag.toString('hex') };
}

export function decryptAES256GCM(encrypted: Buffer, key: Buffer, ivHex: string, tagHex: string): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
