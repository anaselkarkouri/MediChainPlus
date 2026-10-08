export type Role = "patient" | "doctor" | "pharmacy" | "insurer" | "admin";

export interface AuthState {
  token: string;
  address: string;
  roles: Role[];
  demo?: boolean;
  patientId?: string;
  doctorId?: string;
  pharmacyId?: string;
  insurerId?: string;
}

export interface HealthStatus {
  status: string;
  fabricConfigured: boolean;
  reimbursementConfigured: boolean;
  drugTraceabilityConfigured: boolean;
  ipfsApiUrl: string;
}

export interface FabricStatus {
  mode: string;
  connectionProfileExists?: boolean;
}

export interface IpfsStatus {
  connected: boolean;
  version?: string;
  apiUrl: string;
}

export interface ContractInfo {
  chainId: string;
  signer: string;
  reimbursementContract: string | null;
  drugTraceabilityContract: string | null;
}

export interface Patient {
  patientId: string;
  name?: string;
  walletAddress?: string;
  did?: string;
  active?: boolean;
}

export interface MedicalRecord {
  recordId: string;
  patientId: string;
  doctorId: string;
  recordType: string;
  ipfsCid?: string;
  fileHash?: string;
  createdAt?: string;
}

export interface Prescription {
  prescriptionId: string;
  patientId: string;
  doctorId: string;
  status: string;
  medications?: unknown[];
  signatureHash?: string;
  createdAt?: string;
}

export interface Claim {
  id: string;
  patient: string;
  amountWei: string;
  approved: boolean;
  paid: boolean;
}

export interface Drug {
  batchId: string;
  name: string;
  manufacturer: string;
  historyCount: string;
}
