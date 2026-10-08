import { MedicalRecordContract } from '../src/medicalRecord';
import { createMockContext } from './mockContext';

describe('MedicalRecordContract', () => {
  let contract: MedicalRecordContract;
  let ctx: any;
  const record = {
    recordId: 'REC-001', patientId: 'PAT-001', doctorId: 'DOC-001', recordType: 'CONSULTATION', title: 'Checkup',
    ipfsCid: 'bafy...', fileHashSHA256: 'hash123', encryptionAlgorithm: 'AES-256-GCM', encryptionKeyRef: 'key-ref',
    accessPolicy: { patientId: 'PAT-001', allowedDoctorIds: ['DOC-001'] }
  };

  beforeEach(() => { contract = new MedicalRecordContract(); ctx = createMockContext(); });

  it('create record success', async () => {
    const result = await contract.CreateMedicalRecord(ctx, JSON.stringify(record));
    expect(result.recordId).toBe('REC-001');
    expect(ctx.__events[0].name).toBe('MedicalRecordCreated');
  });

  it('missing IPFS CID rejected', async () => {
    const bad = { ...record, recordId: 'REC-002', ipfsCid: '' };
    await expect(contract.CreateMedicalRecord(ctx, JSON.stringify(bad))).rejects.toThrow('ipfsCid is required');
  });

  it('hash verification', async () => {
    await contract.CreateMedicalRecord(ctx, JSON.stringify(record));
    const ok = await contract.VerifyRecordIntegrity(ctx, 'REC-001', 'hash123');
    expect(ok.valid).toBe(true);
  });

  it('query by patient and revoke record', async () => {
    await contract.CreateMedicalRecord(ctx, JSON.stringify(record));
    const byPatient = await contract.GetRecordsByPatient(ctx, 'PAT-001');
    expect(byPatient.length).toBe(1);
    const revoked = await contract.RevokeMedicalRecord(ctx, 'REC-001', 'sha256:reason');
    expect(revoked.status).toBe('REVOKED');
  });

  it('link record to claim', async () => {
    await contract.CreateMedicalRecord(ctx, JSON.stringify(record));
    const linked = await contract.LinkRecordToClaim(ctx, 'REC-001', JSON.stringify({ claimId: '0', reimbursementContractAddress: '0x5FbDB...' }));
    expect(linked.claimReferences.length).toBe(1);
  });
});
