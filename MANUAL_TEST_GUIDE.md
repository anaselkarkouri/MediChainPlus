# MediChain+ API Gateway - Guide de test manuel

Ce guide teste la partie Omar Gaga: API Gateway, login wallet/JWT, smart contracts, Fabric Anas, IPFS Anas et les flows hybrides.

## 1. Demarrer la blockchain locale

Dans un premier terminal:

```powershell
npm install
npm run node
```

Laisser ce terminal ouvert.

## 2. Deployer les contrats

Dans un deuxieme terminal:

```powershell
npm run deploy:local
```

Copier les deux adresses affichees, puis creer `.env` a partir de `.env.example`.

Exemple local:

```env
API_PORT=3001
API_RPC_URL=http://127.0.0.1:8545
API_SIGNER_INDEX=0
JWT_SECRET=change-this-local-secret
REIMBURSEMENT_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
DRUG_TRACEABILITY_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
FABRIC_CONNECTION_PROFILE=./fabric-anas/network/connection-org1.json
FABRIC_SAMPLES_PATH=
FABRIC_WALLET_PATH=./wallet/org1
FABRIC_IDENTITY=appUser
FABRIC_IMPORT_USER=User1@org1.example.com
FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL=medichannel
FABRIC_DISCOVERY_ENABLED=true
FABRIC_DISCOVERY_AS_LOCALHOST=true
FABRIC_CC_PATIENT_REGISTRY=patient-registry
FABRIC_CC_MEDICAL_RECORD=medical-record
FABRIC_CC_PRESCRIPTION=prescription
IPFS_API_URL=http://127.0.0.1:5001
IPFS_GATEWAY_URL=http://127.0.0.1:8080/ipfs
```

## 3. Demarrer l'API

Dans le deuxieme terminal:

```powershell
npm run api
```

Verifier:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
Invoke-RestMethod http://127.0.0.1:3001/api/contracts
```

## 4. Login wallet et JWT

Adresse locale Hardhat:

```powershell
$address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
$privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
```

Demander un challenge:

```powershell
$challenge = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/auth/challenge `
  -ContentType "application/json" `
  -Body (@{ address = $address } | ConvertTo-Json)
```

Signer le message et recuperer le token:

```powershell
$signature = node -e "const { Wallet } = require('ethers'); const wallet = new Wallet(process.argv[1]); wallet.signMessage(process.argv[2]).then(console.log)" $privateKey $challenge.message

$auth = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/auth/verify `
  -ContentType "application/json" `
  -Body (@{ address = $address; signature = $signature } | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($auth.token)" }
Invoke-RestMethod http://127.0.0.1:3001/api/auth/me -Headers $headers
```

## 5. Test remboursement

Financer le contrat:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/reimbursement/fund `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ amountEth = "1" } | ConvertTo-Json)
```

Creer une demande:

```powershell
$claim = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/reimbursement/claims `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ amountEth = "0.1" } | ConvertTo-Json)

$claimId = $claim.claimId
```

Valider puis payer:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3001/api/reimbursement/claims/$claimId/validate" -Headers $headers
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3001/api/reimbursement/claims/$claimId/pay" -Headers $headers
Invoke-RestMethod "http://127.0.0.1:3001/api/reimbursement/claims/$claimId"
Invoke-RestMethod http://127.0.0.1:3001/api/reimbursement/events/payments
```

Pour un frontend MetaMask, utiliser aussi:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/reimbursement/claims/tx `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ amountEth = "0.1" } | ConvertTo-Json)
```

## 6. Test tracabilite medicament

Enregistrer un lot:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/drugs `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    batchId = "BATCH-2024-001"
    name = "Amoxicillin 500mg"
    manufacturer = "PharmaCorp"
  } | ConvertTo-Json)
```

Ajouter deux statuts:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/drugs/BATCH-2024-001/status -Headers $headers -ContentType "application/json" -Body (@{ status = "In Transit" } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/drugs/BATCH-2024-001/status -Headers $headers -ContentType "application/json" -Body (@{ status = "At Pharmacy" } | ConvertTo-Json)
```

Verifier:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/drugs/BATCH-2024-001
Invoke-RestMethod http://127.0.0.1:3001/api/drugs/BATCH-2024-001/history
Invoke-RestMethod http://127.0.0.1:3001/api/drugs/events/updated
```

## 7. Verification Fabric / IPFS Anas

Verifier que la configuration Fabric est chargee:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/fabric/status | ConvertTo-Json -Depth 5
```

`connectionProfileExists` doit etre `true`. `walletExists` devient `true` seulement apres creation/enrollment du wallet Fabric dans `./wallet/org1`.

Tester le hash local IPFS sans daemon IPFS:

```powershell
$fileBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("encrypted-test-bytes"))

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/ipfs/files/hash `
  -ContentType "application/json" `
  -Body (@{ fileBase64 = $fileBase64 } | ConvertTo-Json)
```

Quand IPFS Kubo Anas tourne sur `127.0.0.1:5001`, tester:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/ipfs/status
```

## 8. Test Fabric sans Docker

Par defaut `.env` utilise `FABRIC_MODE=mock`. Ce mode teste les routes Fabric avec les noms et payloads d'Anas, mais sans Docker, sans wallet Fabric et sans reseau Hyperledger local. Les donnees sont stockees dans `data/fabric-mock.json`.

Verifier:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/fabric/status | ConvertTo-Json -Depth 5
```

Resultat attendu: `mode` vaut `mock` et `walletExists` vaut `true`.

## 9. Optionnel: vrai reseau Fabric Anas

Le vrai reseau Hyperledger Fabric n'est necessaire que si vous voulez tester les containers Fabric. Dans ce cas, Docker Desktop doit etre ouvert et `.env` doit contenir `FABRIC_MODE=sdk`.

Le livrable Anas est dans `fabric-anas/` a la racine du projet. Dans Git Bash ou WSL:

```bash
cd /c/Users/Omarg/Downloads/medichaine/medichaine/fabric-anas
export FABRIC_SAMPLES_PATH=$HOME/fabric-samples
./scripts/network.sh up
./scripts/createChannel.sh
./scripts/deployChaincodes.sh
```

## 10. Preparer le wallet Fabric Anas pour le mode sdk

Les routes Fabric en mode `sdk` ont besoin d'une identite Fabric dans `./wallet/org1`. Anas n'a pas envoye de wallet dans le ZIP, donc il faut le creer apres le lancement du reseau Fabric.

Si `fabric-samples` est dans ton dossier utilisateur, lance:

```powershell
npm run fabric:wallet
```

Si `fabric-samples` est ailleurs, indique son chemin dans `.env`:

```env
FABRIC_SAMPLES_PATH=C:\chemin\vers\fabric-samples
```

Puis relance:

```powershell
npm run fabric:wallet
Invoke-RestMethod http://127.0.0.1:3001/api/fabric/status | ConvertTo-Json -Depth 5
```

Resultat attendu: `walletExists` devient `true`.

## 11. Test Fabric

Ces commandes fonctionnent directement en mode `mock`. En mode `sdk`, elles necessitent Fabric actif, les chaincodes deployes, et le wallet `./wallet/org1` contenant l'identite `appUser`.

Creer un patient:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/fabric/patients `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    patientId = "PAT-001"
    did = "did:ethr:0x1111111111111111111111111111111111111111"
    walletAddress = "0x1111111111111111111111111111111111111111"
    nationalIdHash = "sha256:test-national-id"
    encryptedName = "base64:aes-gcm-ciphertext"
    birthYear = 2001
    gender = "MALE"
    bloodType = "O+"
    allergies = @("penicillin")
    emergencyContactHash = "sha256:test-emergency"
  } | ConvertTo-Json -Depth 5)
```

Creer un dossier medical:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/fabric/records `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    recordId = "REC-001"
    patientId = "PAT-001"
    doctorId = "DOC-001"
    recordType = "CONSULTATION"
    title = "General consultation"
    descriptionHash = "sha256:description"
    diagnosisHash = "sha256:diagnosis"
    treatmentHash = "sha256:treatment"
    ipfsCid = "bafybeigdyrzt"
    fileHashSHA256 = "hash123"
    encryptionAlgorithm = "AES-256-GCM"
    encryptionKeyRef = "kms/patient/PAT-001/key-1"
    accessPolicy = @{
      patientId = "PAT-001"
      allowedDoctorIds = @("DOC-001")
      allowedInsurerIds = @("INS-001")
    }
  } | ConvertTo-Json -Depth 8)
```

Creer une prescription:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/fabric/prescriptions `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    prescriptionId = "RX-001"
    patientId = "PAT-001"
    doctorId = "DOC-001"
    medications = @(@{
      drugName = "Amoxicillin 500mg"
      dosage = "500mg"
      frequency = "3 times/day"
      duration = "7 days"
      instructions = "After meals"
      batchId = "BATCH-2024-001"
    })
    reasonHash = "sha256:reason"
    signatureHash = "sha256:doctor-signature"
    issuedAt = "2026-05-11T18:00:00Z"
    expiresAt = "2026-06-11T18:00:00Z"
  } | ConvertTo-Json -Depth 8)
```

Verifier:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/fabric/patients/PAT-001 | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:3001/api/fabric/records/REC-001 | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:3001/api/fabric/prescriptions/RX-001 | ConvertTo-Json -Depth 8
```

## 12. Test remboursement hybride Fabric + smart contract

Quand `PAT-001` et `REC-001` existent sur Fabric:

```powershell
$hybridClaim = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3001/api/reimbursement/claims `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    amountEth = "0.1"
    patientId = "PAT-001"
    recordId = "REC-001"
    expectedFileHash = "hash123"
  } | ConvertTo-Json)

$hybridClaim | ConvertTo-Json -Depth 8
```

Resultat attendu: `fabricValidation` contient le patient/dossier valide, le smart contract cree le claim, puis `fabricClaimLink` lie `recordId` avec `claimId` et `txHash`.

Resultat attendu global: le remboursement devient `approved=true` puis `paid=true`, l'historique du lot contient `Registered`, `In Transit`, puis `At Pharmacy`, et le dossier Fabric peut etre lie au claim EVM.
