import crypto from 'crypto';
import { encryptAES256GCM, MedichainIpfsClient } from './ipfsClient.js';

async function main() {
  const ipfs = new MedichainIpfsClient();
  const key = crypto.randomBytes(32);
  const file = Buffer.from('demo encrypted medical file');
  const encrypted = encryptAES256GCM(file, key);
  const metadata = await ipfs.uploadEncryptedFile(encrypted.encrypted, {
    encryptionAlgorithm: 'AES-256-GCM',
    iv: encrypted.iv,
    tag: encrypted.tag,
    ownerPatientId: 'PAT-001'
  });
  console.log(metadata);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
