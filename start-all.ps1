# ═══════════════════════════════════════════════════════════════════════════
# MediChain+ — Démarrage complet de la stack locale
#
# Services démarrés :
#   1. Hardhat EVM node          →  http://127.0.0.1:8545  (chainId 31337)
#   2. IPFS Kubo daemon          →  API :5001  |  Gateway :8082
#   3. API Gateway (Express)     →  http://127.0.0.1:3001
#   4. Frontend dev server       →  http://127.0.0.1:8080
#
# Usage : .\start-all.ps1
# ═══════════════════════════════════════════════════════════════════════════
param(
  [switch]$NoDeploy,   # Passer le déploiement des contracts (si déjà déployés)
  [switch]$NoIPFS      # Passer IPFS (si déjà démarré)
)

$ErrorActionPreference = 'Stop'
$Root  = $PSScriptRoot
$Ipfs  = Join-Path $Root 'tools\kubo\kubo\ipfs.exe'

# ─── Couleurs ─────────────────────────────────────────────────────────────
function Ok   ($msg) { Write-Host "  [OK] $msg"   -ForegroundColor Green  }
function Info ($msg) { Write-Host "  [..] $msg"   -ForegroundColor Cyan   }
function Warn ($msg) { Write-Host "  [!!] $msg"   -ForegroundColor Yellow }
function Fail ($msg) { Write-Host "  [XX] $msg"   -ForegroundColor Red; exit 1 }

function Wait-Port($port, $label, $maxSec=30) {
    $t = 0
    while ($t -lt $maxSec) {
        $c = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue -EA SilentlyContinue
        if ($c) { Ok "$label prêt sur :$port"; return }
        Start-Sleep 1; $t++
    }
    Fail "$label n'a pas répondu sur :$port après ${maxSec}s"
}

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║  MediChain+ — Stack locale            ║" -ForegroundColor Blue
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# ─── 0. Vérifications préalables ──────────────────────────────────────────
Info "Vérification des prérequis..."
if (-not (Get-Command node -EA SilentlyContinue)) { Fail "Node.js non trouvé" }
if (-not (Get-Command npx  -EA SilentlyContinue)) { Fail "npx non trouvé" }
if (-not (Test-Path $Ipfs)) { Fail "IPFS (Kubo) non trouvé : $Ipfs  →  lancez .\start-all.ps1 depuis la racine du projet" }
if (-not (Test-Path (Join-Path $Root '.ipfs'))) { Fail "Repo IPFS non initialisé — lancez d'abord : setup-ipfs.ps1" }
Ok "Prérequis OK"

# ─── 1. Hardhat EVM node ──────────────────────────────────────────────────
$hdPort = 8545
if (Get-NetTCPConnection -LocalPort $hdPort -State Listen -EA SilentlyContinue) {
    Warn "Hardhat déjà sur :$hdPort — skip"
} else {
    Info "Démarrage Hardhat node..."
    Start-Process powershell -ArgumentList "-NoProfile -Command `"cd '$Root'; npx hardhat node`"" -WindowStyle Minimized
    Wait-Port $hdPort "Hardhat"
}

# ─── 2. Déploiement des smart contracts ───────────────────────────────────
if (-not $NoDeploy) {
    Info "Déploiement des smart contracts sur localhost..."
    $deploy = & { cd $Root; npx hardhat run scripts/deploy.ts --network localhost 2>&1 }
    if ($LASTEXITCODE -ne 0) { Fail "Échec du déploiement : $deploy" }
    Ok "Contracts déployés"
} else {
    Warn "Déploiement ignoré (--NoDeploy)"
}

# ─── 3. IPFS daemon ───────────────────────────────────────────────────────
if (-not $NoIPFS) {
    $ipfsPort = 5001
    if (Get-NetTCPConnection -LocalPort $ipfsPort -State Listen -EA SilentlyContinue) {
        Warn "IPFS déjà sur :$ipfsPort — skip"
    } else {
        Info "Démarrage IPFS daemon (API :5001 / Gateway :8082)..."
        $env:IPFS_PATH = Join-Path $Root '.ipfs'
        Start-Process powershell -ArgumentList "-NoProfile -Command `"cd '$Root'; `$env:IPFS_PATH='$($env:IPFS_PATH)'; & '$Ipfs' daemon`"" -WindowStyle Minimized
        Wait-Port $ipfsPort "IPFS"
    }
} else {
    Warn "IPFS ignoré (--NoIPFS)"
}

# ─── 4. API Gateway ───────────────────────────────────────────────────────
$apiPort = 3001
if (Get-NetTCPConnection -LocalPort $apiPort -State Listen -EA SilentlyContinue) {
    Warn "API déjà sur :$apiPort — skip"
} else {
    Info "Démarrage API Gateway..."
    Start-Process powershell -ArgumentList "-NoProfile -Command `"cd '$Root'; node api/server.cjs`"" -WindowStyle Minimized
    Wait-Port $apiPort "API Gateway"
}

# ─── 5. Frontend dev server ───────────────────────────────────────────────
$fePort = 8080
if (Get-NetTCPConnection -LocalPort $fePort -State Listen -EA SilentlyContinue) {
    Warn "Frontend déjà sur :$fePort — skip"
} else {
    Info "Démarrage Frontend dev server..."
    Start-Process powershell -ArgumentList "-NoProfile -Command `"cd '$Root'; node frontend/dev-server.cjs 8080`"" -WindowStyle Minimized
    Wait-Port $fePort "Frontend"
}

# ─── Récap ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ─────────────────────────────────────────" -ForegroundColor Blue
Write-Host "   Stack MediChain+ démarrée" -ForegroundColor Green
Write-Host "  ─────────────────────────────────────────" -ForegroundColor Blue
Write-Host ""
Write-Host "   Landing page   →  http://127.0.0.1:8080/index.html"
Write-Host "   Portails app   →  http://127.0.0.1:8080/app.html"
Write-Host "   API health     →  http://127.0.0.1:3001/health"
Write-Host "   IPFS WebUI     →  http://127.0.0.1:5001/webui"
Write-Host "   IPFS Gateway   →  http://127.0.0.1:8082/ipfs/<CID>"
Write-Host "   EVM RPC        →  http://127.0.0.1:8545"
Write-Host ""
