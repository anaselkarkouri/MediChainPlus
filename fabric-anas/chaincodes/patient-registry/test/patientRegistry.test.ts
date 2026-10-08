import { PatientRegistryContract } from '../src/patientRegistry';
import { createMockContext } from './mockContext';

describe('PatientRegistryContract', () => {
  let contract: PatientRegistryContract;
  let ctx: any;
  const patient = {
    patientId: 'PAT-001', did: 'did:ethr:0xabc', walletAddress: '0xABC', nationalIdHash: 'sha256:nid', encryptedName: 'cipher', birthYear: 2001, allergies: []
  };

  beforeEach(() => { contract = new PatientRegistryContract(); ctx = createMockContext(); });

  it('registration success', async () => {
    const result = await contract.RegisterPatient(ctx, JSON.stringify(patient));
    expect(result.patientId).toBe('PAT-001');
    expect(ctx.__events[0].name).toBe('PatientRegistered');
  });

  it('duplicate patient rejected', async () => {
    await contract.RegisterPatient(ctx, JSON.stringify(patient));
    await expect(contract.RegisterPatient(ctx, JSON.stringify(patient))).rejects.toThrow('already exists');
  });

  it('missing fields rejected', async () => {
    await expect(contract.RegisterPatient(ctx, JSON.stringify({ patientId: 'PAT-X' }))).rejects.toThrow('did is required');
  });

  it('update and deactivate', async () => {
    await contract.RegisterPatient(ctx, JSON.stringify(patient));
    const updated = await contract.UpdatePatient(ctx, JSON.stringify({ patientId: 'PAT-001', bloodType: 'A+' }));
    expect(updated.bloodType).toBe('A+');
    const deactivated = await contract.DeactivatePatient(ctx, 'PAT-001');
    expect(deactivated.status).toBe('INACTIVE');
  });

  it('consent grant/revoke', async () => {
    await contract.RegisterPatient(ctx, JSON.stringify(patient));
    const consent = await contract.GrantConsent(ctx, 'PAT-001', 'DOC-001', 'READ_RECORDS', '2026-12-31T00:00:00Z');
    expect(consent.revoked).toBe(false);
    const revoked = await contract.RevokeConsent(ctx, 'PAT-001', consent.consentId);
    expect(revoked.revoked).toBe(true);
  });
});
