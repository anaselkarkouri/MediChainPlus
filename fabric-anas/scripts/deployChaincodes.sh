#!/usr/bin/env bash
set -euo pipefail

CHANNEL_NAME=${CHANNEL_NAME:-medichannel}
FABRIC_SAMPLES_PATH=${FABRIC_SAMPLES_PATH:-$HOME/fabric-samples}
TEST_NETWORK_DIR="$FABRIC_SAMPLES_PATH/test-network"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

deploy_one() {
  local name="$1"
  local path="$2"
  pushd "$TEST_NETWORK_DIR" >/dev/null
  ./network.sh deployCC -c "$CHANNEL_NAME" -ccn "$name" -ccp "$path" -ccl typescript
  popd >/dev/null
}

npm install
npm run build

deploy_one patient-registry "$ROOT_DIR/chaincodes/patient-registry"
deploy_one medical-record "$ROOT_DIR/chaincodes/medical-record"
deploy_one prescription "$ROOT_DIR/chaincodes/prescription"

echo "[OK] All MediChain+ chaincodes deployed on channel $CHANNEL_NAME."
