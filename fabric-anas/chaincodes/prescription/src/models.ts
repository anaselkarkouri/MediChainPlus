export type PrescriptionStatus = 'ACTIVE' | 'DISPENSED' | 'CANCELLED' | 'EXPIRED';

export interface Medication {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  batchId?: string;
}

export interface Prescription {
  objectType: 'prescription';
  prescriptionId: string;
  patientId: string;
  doctorId: string;
  medications: Medication[];
  diagnosisHash?: string;
  reasonHash?: string;
  ipfsCid?: string;
  signatureHash: string;
  doctorSignature?: string;
  issuedAt: string;
  expiresAt: string;
  status: PrescriptionStatus;
  pharmacyId?: string;
  dispensedAt?: string;
  cancellationReasonHash?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
