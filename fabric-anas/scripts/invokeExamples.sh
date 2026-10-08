#!/usr/bin/env bash
set -euo pipefail

CHANNEL_NAME=${CHANNEL_NAME:-medichannel}
FABRIC_SAMPLES_PATH=${FABRIC_SAMPLES_PATH:-$HOME/fabric-samples}
TEST_NETWORK_DIR="$FABRIC_SAMPLES_PATH/test-network"
export PATH="$FABRIC_SAMPLES_PATH/bin:$PATH"
export FABRIC_CFG_PATH="$TEST_NETWORK_DIR/../config"

source "$TEST_NETWORK_DIR/scripts/envVar.sh"
setGlobals 1
: "${MEDICHAIN_MSP_PATH:?Set MEDICHAIN_MSP_PATH to an enrolled MSP with role=admin}"
export CORE_PEER_MSPCONFIGPATH="$MEDICHAIN_MSP_PATH"

invoke_json() {
  local chaincode="$1" method="$2" payload="$3"
  local args
  args=$(node -e 'process.stdout.write(JSON.stringify({Args:process.argv.slice(1)}))' "$method" "$payload")
  peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C "$CHANNEL_NAME" -n "$chaincode" --peerAddresses localhost:7051 --tlsRootCertFiles "$PEER0_ORG1_CA" --waitForEvent -c "$args"
}

PATIENT='{"patientId":"PAT-001","did":"did:ethr:0x1111111111111111111111111111111111111111","walletAddress":"0x1111111111111111111111111111111111111111","nationalIdHash":"sha256:national-id","encryptedName":"base64:ciphertext","birthYear":2001,"gender":"MALE","bloodType":"O+","allergies":["penicillin"],"emergencyContactHash":"sha256:emergency"}'

invoke_json patient-registry RegisterPatient "$PATIENT"
peer chaincode query -C "$CHANNEL_NAME" -n patient-registry -c '{"Args":["GetPatient","PAT-001"]}'

RECORD='{"recordId":"REC-001","patientId":"PAT-001","doctorId":"DOC-001","recordType":"CONSULTATION","title":"General consultation","descriptionHash":"sha256:desc","diagnosisHash":"sha256:diag","treatmentHash":"sha256:treat","ipfsCid":"bafybeigdyrzt5fakecid","fileHashSHA256":"a4f2dffakehash","encryptionAlgorithm":"AES-256-GCM","encryptionKeyRef":"kms/PAT-001/key1","accessPolicy":{"patientId":"PAT-001","allowedDoctorIds":["DOC-001"],"allowedInsurerIds":["INS-001"]}}'
invoke_json medical-record CreateMedicalRecord "$RECORD"
peer chaincode query -C "$CHANNEL_NAME" -n medical-record -c '{"Args":["GetMedicalRecord","REC-001"]}'

RX='{"prescriptionId":"RX-001","patientId":"PAT-001","doctorId":"DOC-001","medications":[{"drugName":"Amoxicillin 500mg","dosage":"500mg","frequency":"3 times/day","duration":"7 days","instructions":"After meals","batchId":"BATCH-2024-001"}],"reasonHash":"sha256:reason","signatureHash":"sha256:signature","issuedAt":"2026-05-11T18:00:00Z","expiresAt":"2026-06-11T18:00:00Z"}'
invoke_json prescription CreatePrescription "$RX"
peer chaincode query -C "$CHANNEL_NAME" -n prescription -c '{"Args":["GetPrescription","RX-001"]}'
