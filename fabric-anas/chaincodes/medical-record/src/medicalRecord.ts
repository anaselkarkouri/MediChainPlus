import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { ClaimReference, MedicalRecord, MedicalRecordType } from './models';
import { emitEvent, getClientId, getStateJson, nowISO, parseJson, putStateJson, queryAll, requireRole, requireString, validateStatus } from './util';

const RECORD_PREFIX = 'RECORD_';
const RECORD_TYPES = ['CONSULTATION', 'LAB_RESULT', 'RADIOLOGY', 'SURGERY', 'OTHER'] as const;

@Info({ title: 'MedicalRecord', description: 'MediChain+ medical record metadata chaincode' })
export class MedicalRecordContract extends Contract {
  private recordKey(recordId: string): string {
    return `${RECORD_PREFIX}${recordId}`;
  }

  @Transaction()
  public async InitLedger(ctx: Context): Promise<void> {
    const record: Partial<MedicalRecord> = {
      recordId: 'REC-DEMO-001',
      patientId: 'PAT-DEMO-001',
      doctorId: 'DOC-DEMO-001',
      recordType: 'CONSULTATION',
      title: 'Demo consultation',
      descriptionHash: 'sha256:demo-description',
      diagnosisHash: 'sha256:demo-diagnosis',
      treatmentHash: 'sha256:demo-treatment',
      ipfsCid: 'bafybeigdemoencryptedfilecid',
      fileHashSHA256: 'demo-file-sha256',
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyRef: 'demo-key-ref',
      accessPolicy: { patientId: 'PAT-DEMO-001', allowedDoctorIds: ['DOC-DEMO-001'] }
    };
    const exists = await this.MedicalRecordExists(ctx, record.recordId!);
    if (!exists) await this.CreateMedicalRecord(ctx, JSON.stringify(record));
  }

  @Transaction()
  @Returns('object')
  public async CreateMedicalRecord(ctx: Context, recordJson: string): Promise<MedicalRecord> {
    requireRole(ctx, ['doctor', 'admin']);
    const input = parseJson<Partial<MedicalRecord>>(recordJson, 'recordJson');
    const recordId = requireString(input.recordId, 'recordId');
    const patientId = requireString(input.patientId, 'patientId');
    const doctorId = requireString(input.doctorId, 'doctorId');
    const recordType = requireString(input.recordType, 'recordType') as MedicalRecordType;
    validateStatus(recordType, RECORD_TYPES, 'recordType');
    const title = requireString(input.title, 'title');
    const ipfsCid = requireString(input.ipfsCid, 'ipfsCid');
    const fileHashSHA256 = requireString(input.fileHashSHA256, 'fileHashSHA256');
    const encryptionAlgorithm = requireString(input.encryptionAlgorithm, 'encryptionAlgorithm');
    if (encryptionAlgorithm !== 'AES-256-GCM') throw new Error('encryptionAlgorithm must be AES-256-GCM');
    if (!input.encryptionKeyRef && !input.keyEncryptedForPatient) throw new Error('encryptionKeyRef or keyEncryptedForPatient is required');
    const exists = await this.MedicalRecordExists(ctx, recordId);
    if (exists) throw new Error(`Medical record ${recordId} already exists`);
    const now = nowISO(ctx);
    const record: MedicalRecord = {
      objectType: 'medicalRecord',
      recordId,
      patientId,
      doctorId,
      recordType,
      title,
      descriptionHash: input.descriptionHash,
      encryptedSummary: input.encryptedSummary,
      diagnosisHash: input.diagnosisHash,
      treatmentHash: input.treatmentHash,
      ipfsCid,
      fileHashSHA256,
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyRef: input.encryptionKeyRef,
      keyEncryptedForPatient: input.keyEncryptedForPatient,
      createdAt: now,
      updatedAt: now,
      createdBy: getClientId(ctx),
      accessPolicy: input.accessPolicy ?? { patientId },
      status: 'ACTIVE',
      claimReferences: []
    };
    await putStateJson(ctx, this.recordKey(recordId), record);
    emitEvent(ctx, 'MedicalRecordCreated', { recordId, patientId, doctorId, recordType, ipfsCid, fileHashSHA256, createdAt: now });
    return record;
  }

  @Transaction(false)
  @Returns('object')
  public async GetMedicalRecord(ctx: Context, recordId: string): Promise<MedicalRecord> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const id = requireString(recordId, 'recordId');
    const record = await getStateJson<MedicalRecord>(ctx, this.recordKey(id));
    if (!record) throw new Error(`Medical record ${id} does not exist`);
    return record;
  }

  @Transaction()
  @Returns('object')
  public async UpdateMedicalRecordMetadata(ctx: Context, recordJson: string): Promise<MedicalRecord> {
    requireRole(ctx, ['doctor', 'admin']);
    const input = parseJson<Partial<MedicalRecord>>(recordJson, 'recordJson');
    const recordId = requireString(input.recordId, 'recordId');
    const existing = await this.GetMedicalRecord(ctx, recordId);
    if (existing.status !== 'ACTIVE') throw new Error(`Medical record ${recordId} is not active`);
    const updated: MedicalRecord = {
      ...existing,
      title: input.title ?? existing.title,
      descriptionHash: input.descriptionHash ?? existing.descriptionHash,
      encryptedSummary: input.encryptedSummary ?? existing.encryptedSummary,
      diagnosisHash: input.diagnosisHash ?? existing.diagnosisHash,
      treatmentHash: input.treatmentHash ?? existing.treatmentHash,
      accessPolicy: input.accessPolicy ?? existing.accessPolicy,
      updatedAt: nowISO(ctx)
    };
    await putStateJson(ctx, this.recordKey(recordId), updated);
    emitEvent(ctx, 'MedicalRecordUpdated', { recordId, updatedAt: updated.updatedAt });
    return updated;
  }

  @Transaction()
  @Returns('object')
  public async RevokeMedicalRecord(ctx: Context, recordId: string, reasonHash: string): Promise<MedicalRecord> {
    requireRole(ctx, ['doctor', 'admin']);
    const record = await this.GetMedicalRecord(ctx, recordId);
    record.status = 'REVOKED';
    record.revocationReasonHash = requireString(reasonHash, 'reasonHash');
    record.updatedAt = nowISO(ctx);
    await putStateJson(ctx, this.recordKey(record.recordId), record);
    emitEvent(ctx, 'MedicalRecordRevoked', { recordId: record.recordId, reasonHash: record.revocationReasonHash, updatedAt: record.updatedAt });
    return record;
  }

  @Transaction(false)
  @Returns('boolean')
  public async MedicalRecordExists(ctx: Context, recordId: string): Promise<boolean> {
    const id = requireString(recordId, 'recordId');
    const data = await ctx.stub.getState(this.recordKey(id));
    return !!data && data.length > 0;
  }

  @Transaction(false)
  @Returns('object')
  public async GetRecordsByPatient(ctx: Context, patientId: string): Promise<MedicalRecord[]> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    return queryAll<MedicalRecord>(ctx, { selector: { objectType: 'medicalRecord', patientId: requireString(patientId, 'patientId') } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetRecordsByDoctor(ctx: Context, doctorId: string): Promise<MedicalRecord[]> {
    requireRole(ctx, ['doctor', 'admin']);
    return queryAll<MedicalRecord>(ctx, { selector: { objectType: 'medicalRecord', doctorId: requireString(doctorId, 'doctorId') } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetRecordsByType(ctx: Context, patientId: string, recordType: string): Promise<MedicalRecord[]> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const type = requireString(recordType, 'recordType');
    validateStatus(type, RECORD_TYPES, 'recordType');
    return queryAll<MedicalRecord>(ctx, { selector: { objectType: 'medicalRecord', patientId: requireString(patientId, 'patientId'), recordType: type } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetRecordHistory(ctx: Context, recordId: string): Promise<unknown[]> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const id = requireString(recordId, 'recordId');
    const iterator = await ctx.stub.getHistoryForKey(this.recordKey(id));
    const results: unknown[] = [];
    while (true) {
      const res = await iterator.next();
      if (res.value) {
        results.push({
          txId: res.value.txId,
          timestamp: res.value.timestamp,
          isDelete: res.value.isDelete,
          value: res.value.value?.length ? JSON.parse(res.value.value.toString()) : null
        });
      }
      if (res.done) {
        await iterator.close();
        return results;
      }
    }
  }

  @Transaction(false)
  @Returns('object')
  public async VerifyRecordIntegrity(ctx: Context, recordId: string, expectedFileHash: string): Promise<{ recordId: string; valid: boolean; storedHash: string; expectedHash: string }> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const record = await this.GetMedicalRecord(ctx, recordId);
    const expectedHash = requireString(expectedFileHash, 'expectedFileHash');
    const valid = record.fileHashSHA256 === expectedHash;
    emitEvent(ctx, 'RecordIntegrityVerified', { recordId: record.recordId, valid, storedHash: record.fileHashSHA256, expectedHash });
    return { recordId: record.recordId, valid, storedHash: record.fileHashSHA256, expectedHash };
  }

  @Transaction()
  @Returns('object')
  public async LinkRecordToClaim(ctx: Context, recordId: string, claimReference: string): Promise<MedicalRecord> {
    requireRole(ctx, ['insurer', 'admin']);
    const record = await this.GetMedicalRecord(ctx, recordId);
    const input = parseJson<Partial<ClaimReference>>(claimReference, 'claimReference');
    const claimId = requireString(input.claimId, 'claimId');
    const ref: ClaimReference = {
      claimId,
      reimbursementContractAddress: input.reimbursementContractAddress,
      patientWallet: input.patientWallet,
      amountWei: input.amountWei,
      txHash: input.txHash,
      linkedAt: nowISO(ctx),
      linkedBy: getClientId(ctx)
    };
    record.claimReferences.push(ref);
    record.updatedAt = ref.linkedAt;
    await putStateJson(ctx, this.recordKey(record.recordId), record);
    emitEvent(ctx, 'RecordLinkedToClaim', { recordId: record.recordId, claimId, reimbursementContractAddress: ref.reimbursementContractAddress, txHash: ref.txHash });
    return record;
  }
}
