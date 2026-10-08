import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { Medication, Prescription, PrescriptionStatus } from './models';
import { emitEvent, getClientId, getStateJson, nowISO, parseJson, putStateJson, queryAll, requireArray, requireRole, requireString, validateStatus } from './util';

const RX_PREFIX = 'PRESCRIPTION_';
const STATUSES = ['ACTIVE', 'DISPENSED', 'CANCELLED', 'EXPIRED'] as const;

@Info({ title: 'Prescription', description: 'MediChain+ doctor prescription chaincode' })
export class PrescriptionContract extends Contract {
  private rxKey(prescriptionId: string): string {
    return `${RX_PREFIX}${prescriptionId}`;
  }

  private validateMedication(m: Partial<Medication>, index: number): Medication {
    return {
      drugName: requireString(m.drugName, `medications[${index}].drugName`),
      dosage: requireString(m.dosage, `medications[${index}].dosage`),
      frequency: requireString(m.frequency, `medications[${index}].frequency`),
      duration: requireString(m.duration, `medications[${index}].duration`),
      instructions: requireString(m.instructions, `medications[${index}].instructions`),
      batchId: m.batchId
    };
  }

  @Transaction()
  public async InitLedger(ctx: Context): Promise<void> {
    const prescription: Partial<Prescription> = {
      prescriptionId: 'RX-DEMO-001',
      patientId: 'PAT-DEMO-001',
      doctorId: 'DOC-DEMO-001',
      medications: [
        { drugName: 'Amoxicillin 500mg', dosage: '500mg', frequency: '3 times/day', duration: '7 days', instructions: 'After meals', batchId: 'BATCH-2024-001' }
      ],
      reasonHash: 'sha256:demo-reason',
      signatureHash: 'sha256:demo-doctor-signature',
      issuedAt: '2026-05-11T18:00:00Z',
      expiresAt: '2026-06-11T18:00:00Z'
    };
    const exists = await this.PrescriptionExists(ctx, prescription.prescriptionId!);
    if (!exists) await this.CreatePrescription(ctx, JSON.stringify(prescription));
  }

  @Transaction()
  @Returns('object')
  public async CreatePrescription(ctx: Context, prescriptionJson: string): Promise<Prescription> {
    requireRole(ctx, ['doctor', 'admin']);
    const input = parseJson<Partial<Prescription>>(prescriptionJson, 'prescriptionJson');
    const prescriptionId = requireString(input.prescriptionId, 'prescriptionId');
    const patientId = requireString(input.patientId, 'patientId');
    const doctorId = requireString(input.doctorId, 'doctorId');
    const meds = requireArray<Partial<Medication>>(input.medications, 'medications');
    if (meds.length === 0) throw new Error('medications must contain at least one item');
    const medications = meds.map((m, i) => this.validateMedication(m, i));
    const signatureHash = requireString(input.signatureHash ?? input.doctorSignature, 'signatureHash or doctorSignature');
    const issuedAt = requireString(input.issuedAt, 'issuedAt');
    const expiresAt = requireString(input.expiresAt, 'expiresAt');
    const exists = await this.PrescriptionExists(ctx, prescriptionId);
    if (exists) throw new Error(`Prescription ${prescriptionId} already exists`);
    const now = nowISO(ctx);
    const prescription: Prescription = {
      objectType: 'prescription',
      prescriptionId,
      patientId,
      doctorId,
      medications,
      diagnosisHash: input.diagnosisHash,
      reasonHash: input.reasonHash,
      ipfsCid: input.ipfsCid,
      signatureHash,
      doctorSignature: input.doctorSignature,
      issuedAt,
      expiresAt,
      status: 'ACTIVE',
      pharmacyId: input.pharmacyId,
      createdAt: now,
      updatedAt: now,
      createdBy: getClientId(ctx)
    };
    await putStateJson(ctx, this.rxKey(prescriptionId), prescription);
    emitEvent(ctx, 'PrescriptionCreated', { prescriptionId, patientId, doctorId, medicationCount: medications.length, issuedAt, expiresAt });
    return prescription;
  }

  @Transaction(false)
  @Returns('object')
  public async GetPrescription(ctx: Context, prescriptionId: string): Promise<Prescription> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const id = requireString(prescriptionId, 'prescriptionId');
    const rx = await getStateJson<Prescription>(ctx, this.rxKey(id));
    if (!rx) throw new Error(`Prescription ${id} does not exist`);
    return rx;
  }

  @Transaction()
  @Returns('object')
  public async UpdatePrescriptionStatus(ctx: Context, prescriptionId: string, status: string): Promise<Prescription> {
    requireRole(ctx, ['doctor', 'admin']);
    const rx = await this.GetPrescription(ctx, prescriptionId);
    const cleanStatus = requireString(status, 'status') as PrescriptionStatus;
    validateStatus(cleanStatus, STATUSES);
    if (rx.status === 'CANCELLED' || rx.status === 'DISPENSED') {
      throw new Error(`Prescription ${rx.prescriptionId} is final and cannot be changed from ${rx.status}`);
    }
    rx.status = cleanStatus;
    rx.updatedAt = nowISO(ctx);
    await putStateJson(ctx, this.rxKey(rx.prescriptionId), rx);
    emitEvent(ctx, 'PrescriptionStatusUpdated', { prescriptionId: rx.prescriptionId, status: cleanStatus, updatedAt: rx.updatedAt });
    return rx;
  }

  @Transaction()
  @Returns('object')
  public async CancelPrescription(ctx: Context, prescriptionId: string, reasonHash: string): Promise<Prescription> {
    requireRole(ctx, ['doctor', 'admin']);
    const rx = await this.GetPrescription(ctx, prescriptionId);
    if (rx.status === 'DISPENSED') throw new Error('Cannot cancel an already dispensed prescription');
    rx.status = 'CANCELLED';
    rx.cancellationReasonHash = requireString(reasonHash, 'reasonHash');
    rx.updatedAt = nowISO(ctx);
    await putStateJson(ctx, this.rxKey(rx.prescriptionId), rx);
    emitEvent(ctx, 'PrescriptionCancelled', { prescriptionId: rx.prescriptionId, reasonHash: rx.cancellationReasonHash, updatedAt: rx.updatedAt });
    return rx;
  }

  @Transaction()
  @Returns('object')
  public async DispensePrescription(ctx: Context, prescriptionId: string, pharmacyId: string): Promise<Prescription> {
    requireRole(ctx, ['pharmacy', 'admin']);
    const rx = await this.GetPrescription(ctx, prescriptionId);
    if (rx.status !== 'ACTIVE') throw new Error(`Prescription ${rx.prescriptionId} must be ACTIVE to dispense`);
    rx.status = 'DISPENSED';
    rx.pharmacyId = requireString(pharmacyId, 'pharmacyId');
    rx.dispensedAt = nowISO(ctx);
    rx.updatedAt = rx.dispensedAt;
    await putStateJson(ctx, this.rxKey(rx.prescriptionId), rx);
    emitEvent(ctx, 'PrescriptionDispensed', { prescriptionId: rx.prescriptionId, pharmacyId: rx.pharmacyId, dispensedAt: rx.dispensedAt });
    return rx;
  }

  @Transaction(false)
  @Returns('boolean')
  public async PrescriptionExists(ctx: Context, prescriptionId: string): Promise<boolean> {
    const id = requireString(prescriptionId, 'prescriptionId');
    const data = await ctx.stub.getState(this.rxKey(id));
    return !!data && data.length > 0;
  }

  @Transaction(false)
  @Returns('object')
  public async GetPrescriptionsByPatient(ctx: Context, patientId: string): Promise<Prescription[]> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    return queryAll<Prescription>(ctx, { selector: { objectType: 'prescription', patientId: requireString(patientId, 'patientId') } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetPrescriptionsByDoctor(ctx: Context, doctorId: string): Promise<Prescription[]> {
    requireRole(ctx, ['doctor', 'admin']);
    return queryAll<Prescription>(ctx, { selector: { objectType: 'prescription', doctorId: requireString(doctorId, 'doctorId') } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetPrescriptionsByPharmacy(ctx: Context, pharmacyId: string): Promise<Prescription[]> {
    requireRole(ctx, ['pharmacy', 'admin']);
    return queryAll<Prescription>(ctx, { selector: { objectType: 'prescription', pharmacyId: requireString(pharmacyId, 'pharmacyId') } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetActivePrescriptionsByPatient(ctx: Context, patientId: string): Promise<Prescription[]> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    return queryAll<Prescription>(ctx, { selector: { objectType: 'prescription', patientId: requireString(patientId, 'patientId'), status: 'ACTIVE' } });
  }

  @Transaction(false)
  @Returns('object')
  public async VerifyPrescriptionSignature(ctx: Context, prescriptionId: string, expectedSignatureHash: string): Promise<{ prescriptionId: string; valid: boolean; storedSignatureHash: string; expectedSignatureHash: string }> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const rx = await this.GetPrescription(ctx, prescriptionId);
    const expected = requireString(expectedSignatureHash, 'expectedSignatureHash');
    const valid = rx.signatureHash === expected || rx.doctorSignature === expected;
    emitEvent(ctx, 'PrescriptionSignatureVerified', { prescriptionId: rx.prescriptionId, valid, storedSignatureHash: rx.signatureHash, expectedSignatureHash: expected });
    return { prescriptionId: rx.prescriptionId, valid, storedSignatureHash: rx.signatureHash, expectedSignatureHash: expected };
  }
}
