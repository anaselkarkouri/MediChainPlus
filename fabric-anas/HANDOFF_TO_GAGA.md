# HANDOFF_TO_GAGA — MediChain+ Fabric Chaincodes

**From:** Anas El Karkouri  
**To:** Omar Gaga  
**Purpose:** Integrate Fabric chaincodes with the Node.js/Express API Gateway.

## 1. Fabric config

| Item | Value |
|---|---|
| Channel | `medichannel` |
| Chaincode 1 | `patient-registry` |
| Chaincode 2 | `medical-record` |
| Chaincode 3 | `prescription` |
| Connection profile | `network/connection-org1.json` |
| Wallet path suggestion | `wallet/org1` |
| Identity suggestion | `appUser` or `admin` for MVP |

## 2. Chaincode functions

### patient-registry

| Function | Args | Type |
|---|---|---|
| `RegisterPatient` | `patientJson` | submit |
| `GetPatient` | `patientId` | evaluate |
| `UpdatePatient` | `patientJson` | submit |
| `DeactivatePatient` | `patientId` | submit |
| `PatientExists` | `patientId` | evaluate |
| `GetAllPatients` | none | evaluate |
| `GetPatientsByWallet` | `walletAddress` | evaluate |
| `GetPatientsByDID` | `did` | evaluate |
| `GrantConsent` | `patientId`, `granteeId`, `scope`, `expiresAt` | submit |
| `RevokeConsent` | `patientId`, `consentId` | submit |
| `GetPatientConsents` | `patientId` | evaluate |

### medical-record

| Function | Args | Type |
|---|---|---|
| `CreateMedicalRecord` | `recordJson` | submit |
| `GetMedicalRecord` | `recordId` | evaluate |
| `UpdateMedicalRecordMetadata` | `recordJson` | submit |
| `RevokeMedicalRecord` | `recordId`, `reasonHash` | submit |
| `MedicalRecordExists` | `recordId` | evaluate |
| `GetRecordsByPatient` | `patientId` | evaluate |
| `GetRecordsByDoctor` | `doctorId` | evaluate |
| `GetRecordsByType` | `patientId`, `recordType` | evaluate |
| `GetRecordHistory` | `recordId` | evaluate |
| `VerifyRecordIntegrity` | `recordId`, `expectedFileHash` | evaluate |
| `LinkRecordToClaim` | `recordId`, `claimReference` | submit |

### prescription

| Function | Args | Type |
|---|---|---|
| `CreatePrescription` | `prescriptionJson` | submit |
| `GetPrescription` | `prescriptionId` | evaluate |
| `UpdatePrescriptionStatus` | `prescriptionId`, `status` | submit |
| `CancelPrescription` | `prescriptionId`, `reasonHash` | submit |
| `DispensePrescription` | `prescriptionId`, `pharmacyId` | submit |
| `PrescriptionExists` | `prescriptionId` | evaluate |
| `GetPrescriptionsByPatient` | `patientId` | evaluate |
| `GetPrescriptionsByDoctor` | `doctorId` | evaluate |
| `GetPrescriptionsByPharmacy` | `pharmacyId` | evaluate |
| `GetActivePrescriptionsByPatient` | `patientId` | evaluate |
| `VerifyPrescriptionSignature` | `prescriptionId`, `expectedSignatureHash` | evaluate |

## 3. Suggested Express routes

### PatientRegistry

- `POST /api/fabric/patients` → `RegisterPatient`
- `GET /api/fabric/patients/:patientId` → `GetPatient`
- `PUT /api/fabric/patients/:patientId` → `UpdatePatient`
- `DELETE /api/fabric/patients/:patientId/deactivate` → `DeactivatePatient`
- `GET /api/fabric/patients/wallet/:walletAddress` → `GetPatientsByWallet`
- `POST /api/fabric/patients/:patientId/consents` → `GrantConsent`
- `DELETE /api/fabric/patients/:patientId/consents/:consentId` → `RevokeConsent`

### MedicalRecord

- `POST /api/fabric/records` → `CreateMedicalRecord`
- `GET /api/fabric/records/:recordId` → `GetMedicalRecord`
- `GET /api/fabric/records/patient/:patientId` → `GetRecordsByPatient`
- `GET /api/fabric/records/doctor/:doctorId` → `GetRecordsByDoctor`
- `POST /api/fabric/records/:recordId/verify-integrity` → `VerifyRecordIntegrity`
- `POST /api/fabric/records/:recordId/link-claim` → `LinkRecordToClaim`
- `PATCH /api/fabric/records/:recordId/revoke` → `RevokeMedicalRecord`

### Prescription

- `POST /api/fabric/prescriptions` → `CreatePrescription`
- `GET /api/fabric/prescriptions/:prescriptionId` → `GetPrescription`
- `GET /api/fabric/prescriptions/patient/:patientId` → `GetPrescriptionsByPatient`
- `GET /api/fabric/prescriptions/doctor/:doctorId` → `GetPrescriptionsByDoctor`
- `GET /api/fabric/prescriptions/pharmacy/:pharmacyId` → `GetPrescriptionsByPharmacy`
- `PATCH /api/fabric/prescriptions/:prescriptionId/status` → `UpdatePrescriptionStatus`
- `PATCH /api/fabric/prescriptions/:prescriptionId/dispense` → `DispensePrescription`
- `PATCH /api/fabric/prescriptions/:prescriptionId/cancel` → `CancelPrescription`
- `POST /api/fabric/prescriptions/:prescriptionId/verify-signature` → `VerifyPrescriptionSignature`

## 4. Payload examples

### RegisterPatient

```json
{
  "patientId": "PAT-001",
  "did": "did:ethr:0x1111111111111111111111111111111111111111",
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "nationalIdHash": "sha256:8a1f...",
  "encryptedName": "base64:aes-gcm-ciphertext",
  "birthYear": 2001,
  "gender": "MALE",
  "bloodType": "O+",
  "allergies": ["penicillin"],
  "emergencyContactHash": "sha256:77ab..."
}
```

### CreateMedicalRecord

```json
{
  "recordId": "REC-001",
  "patientId": "PAT-001",
  "doctorId": "DOC-001",
  "recordType": "CONSULTATION",
  "title": "General consultation",
  "descriptionHash": "sha256:description",
  "diagnosisHash": "sha256:diagnosis",
  "treatmentHash": "sha256:treatment",
  "ipfsCid": "bafybeigdyrzt...",
  "fileHashSHA256": "a4f2...",
  "encryptionAlgorithm": "AES-256-GCM",
  "encryptionKeyRef": "kms/patient/PAT-001/key-1",
  "accessPolicy": {
    "patientId": "PAT-001",
    "allowedDoctorIds": ["DOC-001"],
    "allowedInsurerIds": ["INS-001"]
  }
}
```

### CreatePrescription

```json
{
  "prescriptionId": "RX-001",
  "patientId": "PAT-001",
  "doctorId": "DOC-001",
  "medications": [
    {
      "drugName": "Amoxicillin 500mg",
      "dosage": "500mg",
      "frequency": "3 times/day",
      "duration": "7 days",
      "instructions": "After meals",
      "batchId": "BATCH-2024-001"
    }
  ],
  "reasonHash": "sha256:reason",
  "ipfsCid": "bafybeigoptional...",
  "signatureHash": "sha256:doctor-signature",
  "issuedAt": "2026-05-11T18:00:00Z",
  "expiresAt": "2026-06-11T18:00:00Z"
}
```

## 5. Events to listen to

- `PatientRegistered`
- `PatientUpdated`
- `PatientDeactivated`
- `ConsentGranted`
- `ConsentRevoked`
- `MedicalRecordCreated`
- `MedicalRecordUpdated`
- `MedicalRecordRevoked`
- `RecordIntegrityVerified`
- `RecordLinkedToClaim`
- `PrescriptionCreated`
- `PrescriptionStatusUpdated`
- `PrescriptionCancelled`
- `PrescriptionDispensed`
- `PrescriptionSignatureVerified`

## 6. Fabric Gateway service example

```ts
import * as grpc from '@grpc/grpc-js';
import { connect, signers } from '@hyperledger/fabric-gateway';
import crypto from 'crypto';
import fs from 'fs';

const ccp = JSON.parse(fs.readFileSync('./network/connection-org1.json', 'utf8'));
const walletIdentity = JSON.parse(fs.readFileSync('./wallet/org1/appUser.id', 'utf8'));
const peer = ccp.peers['peer0.org1.example.com'];
const tlsRootCert = fs.readFileSync(peer.tlsCACerts.path);
const client = new grpc.Client('localhost:7051', grpc.credentials.createSsl(tlsRootCert), {
  'grpc.ssl_target_name_override': 'peer0.org1.example.com',
});
const gateway = connect({
  client,
  identity: { mspId: walletIdentity.mspId, credentials: Buffer.from(walletIdentity.credentials.certificate) },
  signer: signers.newPrivateKeySigner(crypto.createPrivateKey(walletIdentity.credentials.privateKey)),
});
const network = await gateway.getNetwork('medichannel');

export async function submit(chaincode: string, fn: string, ...args: string[]) {
  const contract = network.getContract(chaincode);
  const result = await contract.submitTransaction(fn, ...args);
  return result.length ? JSON.parse(result.toString()) : { ok: true };
}

export async function evaluate(chaincode: string, fn: string, ...args: string[]) {
  const contract = network.getContract(chaincode);
  const result = await contract.evaluateTransaction(fn, ...args);
  return result.length ? JSON.parse(result.toString()) : null;
}
```

## 7. Integration with Ilyas's contracts

- Before calling `ReimbursementContract.submitClaim(amount)`, verify patient and medical record exist in Fabric.
- After EVM claim creation, call `medical-record:LinkRecordToClaim(recordId, claimReferenceJson)` where `claimReferenceJson` contains `claimId`, `reimbursementContractAddress`, `patientWallet`, and `txHash` if available.
- For pharmacy flow, use `prescription:GetPrescription` and Ilyas's `DrugTraceabilityContract.verifyDrug(batchId)` / `getDrugHistory(batchId)` together.
