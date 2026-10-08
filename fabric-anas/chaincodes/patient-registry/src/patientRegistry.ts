import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';
import { ConsentReference, Patient } from './models';
import { emitEvent, getClientId, getStateJson, nowISO, parseJson, putStateJson, queryAll, requireRole, requireString } from './util';

const PATIENT_PREFIX = 'PATIENT_';
const CONSENT_PREFIX = 'CONSENT_';

@Info({ title: 'PatientRegistry', description: 'MediChain+ patient registry and consent management chaincode' })
export class PatientRegistryContract extends Contract {
  private patientKey(patientId: string): string {
    return `${PATIENT_PREFIX}${patientId}`;
  }

  private consentKey(patientId: string, consentId: string): string {
    return `${CONSENT_PREFIX}${patientId}_${consentId}`;
  }

  @Transaction()
  public async InitLedger(ctx: Context): Promise<void> {
    const patient: Partial<Patient> = {
      patientId: 'PAT-DEMO-001',
      did: 'did:ethr:0x1111111111111111111111111111111111111111',
      walletAddress: '0x1111111111111111111111111111111111111111',
      nationalIdHash: 'sha256:demo-national-id',
      encryptedName: 'base64:encrypted-demo-name',
      birthYear: 2001,
      gender: 'MALE',
      bloodType: 'O+',
      allergies: ['penicillin'],
      emergencyContactHash: 'sha256:demo-emergency-contact'
    };
    const exists = await this.PatientExists(ctx, patient.patientId!);
    if (!exists) {
      await this.RegisterPatient(ctx, JSON.stringify(patient));
    }
  }

  @Transaction()
  @Returns('object')
  public async RegisterPatient(ctx: Context, patientJson: string): Promise<Patient> {
    requireRole(ctx, ['patient', 'admin']);
    const input = parseJson<Partial<Patient>>(patientJson, 'patientJson');
    const patientId = requireString(input.patientId, 'patientId');
    const did = requireString(input.did, 'did');
    const walletAddress = requireString(input.walletAddress, 'walletAddress').toLowerCase();
    if (!input.nationalIdHash && !input.identityHash) {
      throw new Error('nationalIdHash or identityHash is required; do not store raw CIN/national ID on-chain');
    }
    const exists = await this.PatientExists(ctx, patientId);
    if (exists) throw new Error(`Patient ${patientId} already exists`);

    const now = nowISO(ctx);
    const patient: Patient = {
      objectType: 'patient',
      patientId,
      did,
      walletAddress,
      nationalIdHash: input.nationalIdHash,
      identityHash: input.identityHash,
      encryptedName: input.encryptedName,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      birthYear: input.birthYear,
      gender: input.gender,
      bloodType: input.bloodType,
      allergies: Array.isArray(input.allergies) ? input.allergies : [],
      emergencyContactHash: input.emergencyContactHash,
      emergencyContactEncrypted: input.emergencyContactEncrypted,
      consentReferences: [],
      createdAt: now,
      updatedAt: now,
      createdBy: getClientId(ctx),
      status: 'ACTIVE'
    };

    await putStateJson(ctx, this.patientKey(patientId), patient);
    emitEvent(ctx, 'PatientRegistered', { patientId, did, walletAddress, createdAt: now });
    return patient;
  }

  @Transaction(false)
  @Returns('object')
  public async GetPatient(ctx: Context, patientId: string): Promise<Patient> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const id = requireString(patientId, 'patientId');
    const patient = await getStateJson<Patient>(ctx, this.patientKey(id));
    if (!patient) throw new Error(`Patient ${id} does not exist`);
    return patient;
  }

  @Transaction()
  @Returns('object')
  public async UpdatePatient(ctx: Context, patientJson: string): Promise<Patient> {
    requireRole(ctx, ['patient', 'admin']);
    const input = parseJson<Partial<Patient>>(patientJson, 'patientJson');
    const patientId = requireString(input.patientId, 'patientId');
    const existing = await this.GetPatient(ctx, patientId);
    if (existing.status !== 'ACTIVE') throw new Error(`Patient ${patientId} is not active`);

    const updated: Patient = {
      ...existing,
      did: input.did ?? existing.did,
      walletAddress: input.walletAddress ? input.walletAddress.toLowerCase() : existing.walletAddress,
      nationalIdHash: input.nationalIdHash ?? existing.nationalIdHash,
      identityHash: input.identityHash ?? existing.identityHash,
      encryptedName: input.encryptedName ?? existing.encryptedName,
      fullName: input.fullName ?? existing.fullName,
      dateOfBirth: input.dateOfBirth ?? existing.dateOfBirth,
      birthYear: input.birthYear ?? existing.birthYear,
      gender: input.gender ?? existing.gender,
      bloodType: input.bloodType ?? existing.bloodType,
      allergies: Array.isArray(input.allergies) ? input.allergies : existing.allergies,
      emergencyContactHash: input.emergencyContactHash ?? existing.emergencyContactHash,
      emergencyContactEncrypted: input.emergencyContactEncrypted ?? existing.emergencyContactEncrypted,
      updatedAt: nowISO(ctx)
    };

    await putStateJson(ctx, this.patientKey(patientId), updated);
    emitEvent(ctx, 'PatientUpdated', { patientId, updatedAt: updated.updatedAt });
    return updated;
  }

  @Transaction()
  @Returns('object')
  public async DeactivatePatient(ctx: Context, patientId: string): Promise<Patient> {
    requireRole(ctx, ['patient', 'admin']);
    const patient = await this.GetPatient(ctx, patientId);
    patient.status = 'INACTIVE';
    patient.updatedAt = nowISO(ctx);
    await putStateJson(ctx, this.patientKey(patient.patientId), patient);
    emitEvent(ctx, 'PatientDeactivated', { patientId: patient.patientId, updatedAt: patient.updatedAt });
    return patient;
  }

  @Transaction(false)
  @Returns('boolean')
  public async PatientExists(ctx: Context, patientId: string): Promise<boolean> {
    const id = requireString(patientId, 'patientId');
    const data = await ctx.stub.getState(this.patientKey(id));
    return !!data && data.length > 0;
  }

  @Transaction(false)
  @Returns('object')
  public async GetAllPatients(ctx: Context): Promise<Patient[]> {
    requireRole(ctx, ['admin']);
    return queryAll<Patient>(ctx, { selector: { objectType: 'patient' } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetPatientsByWallet(ctx: Context, walletAddress: string): Promise<Patient[]> {
    requireRole(ctx, ['admin', 'insurer']);
    return queryAll<Patient>(ctx, { selector: { objectType: 'patient', walletAddress: requireString(walletAddress, 'walletAddress').toLowerCase() } });
  }

  @Transaction(false)
  @Returns('object')
  public async GetPatientsByDID(ctx: Context, did: string): Promise<Patient[]> {
    requireRole(ctx, ['admin', 'insurer']);
    return queryAll<Patient>(ctx, { selector: { objectType: 'patient', did: requireString(did, 'did') } });
  }

  @Transaction()
  @Returns('object')
  public async GrantConsent(ctx: Context, patientId: string, granteeId: string, scope: string, expiresAt: string): Promise<ConsentReference> {
    requireRole(ctx, ['patient', 'admin']);
    const patient = await this.GetPatient(ctx, patientId);
    const cleanGranteeId = requireString(granteeId, 'granteeId');
    const cleanScope = requireString(scope, 'scope');
    const cleanExpiresAt = requireString(expiresAt, 'expiresAt');
    const now = nowISO(ctx);
    const consentId = `CONSENT-${patient.patientId}-${ctx.stub.getTxID()}`;
    const consent: ConsentReference = {
      consentId,
      patientId: patient.patientId,
      granteeId: cleanGranteeId,
      scope: cleanScope,
      grantedAt: now,
      expiresAt: cleanExpiresAt,
      revoked: false,
      createdBy: getClientId(ctx)
    };
    patient.consentReferences.push(consentId);
    patient.updatedAt = now;
    await putStateJson(ctx, this.consentKey(patient.patientId, consentId), consent);
    await putStateJson(ctx, this.patientKey(patient.patientId), patient);
    emitEvent(ctx, 'ConsentGranted', { patientId: patient.patientId, consentId, granteeId: cleanGranteeId, scope: cleanScope, expiresAt: cleanExpiresAt });
    return consent;
  }

  @Transaction()
  @Returns('object')
  public async RevokeConsent(ctx: Context, patientId: string, consentId: string): Promise<ConsentReference> {
    requireRole(ctx, ['patient', 'admin']);
    const patient = await this.GetPatient(ctx, patientId);
    const cleanConsentId = requireString(consentId, 'consentId');
    const consent = await getStateJson<ConsentReference>(ctx, this.consentKey(patient.patientId, cleanConsentId));
    if (!consent) throw new Error(`Consent ${cleanConsentId} does not exist for patient ${patient.patientId}`);
    consent.revoked = true;
    consent.revokedAt = nowISO(ctx);
    await putStateJson(ctx, this.consentKey(patient.patientId, cleanConsentId), consent);
    emitEvent(ctx, 'ConsentRevoked', { patientId: patient.patientId, consentId: cleanConsentId, revokedAt: consent.revokedAt });
    return consent;
  }

  @Transaction(false)
  @Returns('object')
  public async GetPatientConsents(ctx: Context, patientId: string): Promise<ConsentReference[]> {
    requireRole(ctx, ['patient', 'doctor', 'pharmacy', 'insurer', 'admin']);
    const patient = await this.GetPatient(ctx, patientId);
    const consents: ConsentReference[] = [];
    for (const consentId of patient.consentReferences) {
      const c = await getStateJson<ConsentReference>(ctx, this.consentKey(patient.patientId, consentId));
      if (c) consents.push(c);
    }
    return consents;
  }
}
