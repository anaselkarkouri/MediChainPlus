export type PatientStatus = 'ACTIVE' | 'INACTIVE';

export interface ConsentReference {
  consentId: string;
  patientId: string;
  granteeId: string;
  scope: string;
  grantedAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
  createdBy: string;
}

export interface Patient {
  objectType: 'patient';
  patientId: string;
  did: string;
  walletAddress: string;
  nationalIdHash?: string;
  identityHash?: string;
  encryptedName?: string;
  fullName?: string;
  dateOfBirth?: string;
  birthYear?: number;
  gender?: string;
  bloodType?: string;
  allergies: string[];
  emergencyContactHash?: string;
  emergencyContactEncrypted?: string;
  consentReferences: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  status: PatientStatus;
}
