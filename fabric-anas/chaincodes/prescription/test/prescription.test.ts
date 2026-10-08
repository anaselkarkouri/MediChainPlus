import { PrescriptionContract } from '../src/prescription';
import { createMockContext } from './mockContext';

describe('PrescriptionContract', () => {
  let contract: PrescriptionContract;
  let ctx: any;
  const rx = {
    prescriptionId: 'RX-001', patientId: 'PAT-001', doctorId: 'DOC-001',
    medications: [{ drugName: 'Amoxicillin', dosage: '500mg', frequency: '3/day', duration: '7 days', instructions: 'After meals', batchId: 'BATCH-1' }],
    reasonHash: 'sha256:reason', signatureHash: 'sha256:sig', issuedAt: '2026-05-11T18:00:00Z', expiresAt: '2026-06-11T18:00:00Z'
  };

  beforeEach(() => { contract = new PrescriptionContract(); ctx = createMockContext(); });

  it('create prescription', async () => {
    const result = await contract.CreatePrescription(ctx, JSON.stringify(rx));
    expect(result.prescriptionId).toBe('RX-001');
    expect(ctx.__events[0].name).toBe('PrescriptionCreated');
  });

  it('invalid medication rejected', async () => {
    const bad = { ...rx, prescriptionId: 'RX-002', medications: [{ drugName: 'X' }] };
    await expect(contract.CreatePrescription(ctx, JSON.stringify(bad))).rejects.toThrow('dosage is required');
  });

  it('update status and signature verification', async () => {
    await contract.CreatePrescription(ctx, JSON.stringify(rx));
    const ok = await contract.VerifyPrescriptionSignature(ctx, 'RX-001', 'sha256:sig');
    expect(ok.valid).toBe(true);
    const expired = await contract.UpdatePrescriptionStatus(ctx, 'RX-001', 'EXPIRED');
    expect(expired.status).toBe('EXPIRED');
  });

  it('dispense', async () => {
    await contract.CreatePrescription(ctx, JSON.stringify(rx));
    const dispensed = await contract.DispensePrescription(ctx, 'RX-001', 'PHARM-001');
    expect(dispensed.status).toBe('DISPENSED');
    expect(dispensed.pharmacyId).toBe('PHARM-001');
  });

  it('cancel', async () => {
    await contract.CreatePrescription(ctx, JSON.stringify(rx));
    const cancelled = await contract.CancelPrescription(ctx, 'RX-001', 'sha256:cancel');
    expect(cancelled.status).toBe('CANCELLED');
  });
});
