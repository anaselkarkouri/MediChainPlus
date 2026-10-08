# MediChain+ — Analyse de contexte pour la partie Anas

MediChain+ est une plateforme de santé blockchain hybride. L'architecture sépare les responsabilités :

- Hyperledger Fabric garde les métadonnées médicales privées, les patients, les records et les prescriptions.
- IPFS garde les fichiers médicaux chiffrés hors chaîne.
- Ethereum/Polygon garde les smart contracts Solidity de remboursement et de traçabilité médicaments.
- Omar Gaga expose les routes backend Node.js/Express et connecte le frontend aux chaincodes et aux contrats EVM.

La partie Anas doit livrer :

1. Un réseau Fabric opérationnel.
2. Trois chaincodes TypeScript : `patient-registry`, `medical-record`, `prescription`.
3. Des indexes CouchDB.
4. Un module IPFS pour upload/download/pinning/hash.
5. Des tests et un handoff exploitable par Omar Gaga.

Alignement avec Ilyas :

- `ReimbursementContract` reçoit les claims et les paiements. Le chaincode `medical-record` fournit la preuve privée côté Fabric que le patient possède un dossier médical avec CID et hash avant l'appel EVM.
- `DrugTraceabilityContract` vérifie les batches de médicaments. Le chaincode `prescription` peut stocker les médicaments prescrits et un `batchId` optionnel par ligne de médicament pour permettre à Gaga/Babba de croiser prescription + traçabilité.
