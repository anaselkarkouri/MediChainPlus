#!/usr/bin/env bash
set -euo pipefail

CHANNEL_NAME=${CHANNEL_NAME:-medichannel}
FABRIC_SAMPLES_PATH=${FABRIC_SAMPLES_PATH:-$HOME/fabric-samples}
TEST_NETWORK_DIR="$FABRIC_SAMPLES_PATH/test-network"

usage() {
  echo "Usage: $0 up|down|restart"
}

if [ $# -lt 1 ]; then usage; exit 1; fi

cmd="$1"

case "$cmd" in
  up)
    if [ ! -d "$TEST_NETWORK_DIR" ]; then
      echo "ERROR: fabric-samples/test-network not found at $TEST_NETWORK_DIR"
      echo "Set FABRIC_SAMPLES_PATH=/path/to/fabric-samples"
      exit 1
    fi
    pushd "$TEST_NETWORK_DIR" >/dev/null
    ./network.sh down
    ./network.sh up -ca -s couchdb
    popd >/dev/null
    docker compose -f docker-compose.yml up -d ipfs
    echo "[OK] Fabric test-network and IPFS are up. Run ./scripts/createChannel.sh next."
    ;;
  down)
    if [ -d "$TEST_NETWORK_DIR" ]; then
      pushd "$TEST_NETWORK_DIR" >/dev/null
      ./network.sh down
      popd >/dev/null
    fi
    docker compose -f docker-compose.yml down
    ;;
  restart)
    "$0" down
    "$0" up
    ;;
  *) usage; exit 1 ;;
esac
