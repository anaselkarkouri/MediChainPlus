#!/usr/bin/env bash
set -euo pipefail

CHANNEL_NAME=${CHANNEL_NAME:-medichannel}
FABRIC_SAMPLES_PATH=${FABRIC_SAMPLES_PATH:-$HOME/fabric-samples}
TEST_NETWORK_DIR="$FABRIC_SAMPLES_PATH/test-network"

pushd "$TEST_NETWORK_DIR" >/dev/null
./network.sh createChannel -c "$CHANNEL_NAME"
popd >/dev/null

echo "[OK] Channel $CHANNEL_NAME created."
