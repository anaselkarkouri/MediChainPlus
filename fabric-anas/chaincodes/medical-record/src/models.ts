export type MedicalRecordType = 'CONSULTATION' | 'LAB_RESULT' | 'RADIOLOGY' | 'SURGERY' | 'OTHER';
export type MedicalRecordStatus = 'ACTIVE' | 'REVOKED' | 'ARCHIVED';

export interface AccessPolicy {
  patientId: string;
  allowedDoctorIds?: string[];
  allowedInsurerIds?: string[];
  allowedPharmacyIds?: string[];
}

export interface ClaimReference {
  claimId: string;
  reimbursementContractAddress?: string;
  patientWallet?: string;
  amountWei?: string;
  txHash?: string;
  linkedAt: string;
  linkedBy: string;
}

export interface MedicalRecord {
  objectType: 'medicalRecord';
  recordId: string;
  patientId: string;
  doctorId: string;
  recordType: MedicalRecordType;
  title: string;
  descriptionHash?: string;
  encryptedSummary?: string;
  diagnosisHash?: string;
  treatmentHash?: string;
  ipfsCid: string;
  fileHashSHA256: string;
  encryptionAlgorithm: 'AES-256-GCM';
  encryptionKeyRef?: string;
  keyEncryptedForPatient?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  accessPolicy: AccessPolicy;
  status: MedicalRecordStatus;
  revocationReasonHash?: string;
  claimReferences: ClaimReference[];
}
