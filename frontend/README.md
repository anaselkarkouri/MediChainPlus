# MediChain+ - Frontend

Interface web multi-portails du projet MediChain+.

Le front suit le cahier des charges et expose uniquement les quatre portails attendus :

| Portail | Parcours couverts |
|---|---|
| Patient | Consultation dossier, consentements, dossiers medicaux, prescriptions, demande de remboursement |
| Medecin | Creation de dossiers medicaux, creation de prescriptions, recherche et verification d'integrite |
| Pharmacie | Verification prescription, dispensation, verification medicament par code QR / batch ID, historique |
| Assureur | Consultation, validation et paiement des remboursements, solde et evenements on-chain |

## Fichiers

| Fichier | Role |
|---|---|
| `index.html` | Landing page stricte basee sur le cahier des charges |
| `app.html` | Tableau de bord principal avec les 4 portails |
| `app.js` | Appels API, auth wallet MetaMask, navigation des portails |
| `styles.css` | Mise en page responsive et composants UI |
| `dev-server.cjs` | Serveur statique + proxy `/api/*` et `/health` |
| `sw.js` | Ancien service worker conserve mais non enregistre en local |

## Lancement rapide (tout en une commande)

Depuis la racine du projet, lancer le script PowerShell :

```powershell
.\start-all.ps1
```

Ce script démarre automatiquement dans l'ordre :

| # | Service | Port |
|---|---------|------|
| 1 | Hardhat EVM node | `:8545` |
| 2 | Smart contracts deploy | — |
| 3 | IPFS Kubo daemon | API `:5001` / Gateway `:8082` |
| 4 | API Gateway (Express) | `:3001` |
| 5 | Frontend dev server | `:8080` |

Puis ouvrir :

```text
Landing page  →  http://127.0.0.1:8080/index.html
Portails app  →  http://127.0.0.1:8080/app.html
IPFS WebUI    →  http://127.0.0.1:5001/webui
```

## Lancement manuel service par service

```powershell
# 1. EVM node (terminal séparé)
npx hardhat node

# 2. Deploy contracts
npx hardhat run scripts/deploy.ts --network localhost

# 3. IPFS daemon (terminal séparé)
$env:IPFS_PATH="$PWD\.ipfs"; .\tools\kubo\kubo\ipfs.exe daemon

# 4. API Gateway (terminal séparé)
node api/server.cjs

# 5. Frontend (terminal séparé)
node frontend/dev-server.cjs 8080
```

## Configuration IPFS

IPFS Kubo v0.33.0 est installé dans `tools/kubo/`. Le repo est initialisé dans `.ipfs/`.

| Paramètre | Valeur |
|-----------|--------|
| API RPC | `http://127.0.0.1:5001` |
| Gateway | `http://127.0.0.1:8082/ipfs/<CID>` |
| WebUI | `http://127.0.0.1:5001/webui` |
| Repo | `.ipfs/` (racine du projet) |

Fonctionnalités IPFS disponibles via l'API Gateway :

| Endpoint | Rôle |
|----------|------|
| `POST /api/ipfs/encrypted-files` | Upload fichier chiffré AES-256-GCM |
| `GET /api/ipfs/files/:cid` | Téléchargement fichier par CID |
| `POST /api/ipfs/files/:cid/pin` | Épinglage permanent |
| `POST /api/ipfs/files/hash` | Calcul SHA-256 |
| `POST /api/ipfs/files/verify` | Vérification intégrité |
| `GET /api/ipfs/status` | Statut de connexion |

## Notes

- Les actions en lecture fonctionnent sans wallet.
- Les actions en ecriture utilisent le JWT obtenu apres signature MetaMask.
- Le proxy `dev-server.cjs` route `/api/*` et `/health` vers `:3001`.
- IPFS gateway sur `:8082` (pas `:8080` pour éviter le conflit avec le frontend).
- Aucun endpoint non present dans `api/server.cjs` n'est expose dans l'interface.
