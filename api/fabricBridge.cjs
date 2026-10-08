"use strict";

/**
 * Fabric → Ethereum Bridge
 *
 * Listens to Hyperledger Fabric events (MedicalRecord, Prescription, Patient)
 * and syncs relevant state to Polygon smart contracts (reimbursement / traceability).
 *
 * Run: node api/fabricBridge.cjs
 * Env: FABRIC_MODE=sdk|mock, API_RPC_URL, REIMBURSEMENT_CONTRACT_ADDRESS, DRUG_TRACEABILITY_CONTRACT_ADDRESS
 */

const { ethers } = require("ethers");
const config = require("./config.cjs");
const { FabricGatewayService } = require("./fabricGateway.cjs");
const { FabricMockService } = require("./fabricMock.cjs");
const { createContractContext } = require("./contracts.cjs");

const RECONNECT_DELAY_MS = 5_000;
const POLL_INTERVAL_MS = config.fabric.mode === "mock" ? 8_000 : 0;

function log(msg) {
  console.log(`[bridge ${new Date().toISOString()}] ${msg}`);
}

function warn(msg) {
  console.warn(`[bridge ${new Date().toISOString()}] WARN ${msg}`);
}

async function handleFabricEvent(eventName, payload, contracts) {
  try {
    switch (eventName) {
      case "MedicalRecordCreated": {
        log(`MedicalRecordCreated → recordId=${payload.recordId} patientId=${payload.patientId}`);
        break;
      }

      case "PrescriptionCreated": {
        log(`PrescriptionCreated → prescriptionId=${payload.prescriptionId}`);
        break;
      }

      case "PrescriptionDispensed": {
        log(`PrescriptionDispensed → prescriptionId=${payload.prescriptionId}`);
        if (contracts.reimbursement && payload.claimAmountWei) {
          const tx = await contracts.reimbursement.submitClaimFor(
            payload.patientWallet,
            BigInt(payload.claimAmountWei)
          );
          const receipt = await tx.wait();
          log(`  ↳ Auto-claim submitted on Polygon tx=${receipt.hash}`);
        }
        break;
      }

      case "DrugStatusUpdated": {
        log(`DrugStatusUpdated → batchId=${payload.batchId} status=${payload.status}`);
        if (contracts.drugTraceability && payload.batchId && payload.status) {
          const tx = await contracts.drugTraceability.updateStatus(payload.batchId, payload.status);
          const receipt = await tx.wait();
          log(`  ↳ Drug status synced to Polygon tx=${receipt.hash}`);
        }
        break;
      }

      case "ConsentRevoked": {
        log(`ConsentRevoked → patientId=${payload.patientId} granteeId=${payload.granteeId}`);
        break;
      }

      default:
        log(`Unhandled Fabric event: ${eventName}`);
    }
  } catch (err) {
    warn(`Error handling ${eventName}: ${err.message}`);
  }
}

async function pollMockEvents(fabric, contracts) {
  log("Mock mode: polling Fabric mock for events…");
  const chaincodes = config.fabric.chaincodes;

  try {
    const records = await fabric.evaluate(chaincodes.medicalRecord, "GetAllRecords", []);
    if (Array.isArray(records) && records.length) {
      log(`Mock poll: ${records.length} medical records found`);
    }
  } catch {
    /* ignore — mock may not implement GetAllRecords */
  }

  try {
    const prescriptions = await fabric.evaluate(chaincodes.prescription, "GetAllPrescriptions", []);
    if (Array.isArray(prescriptions) && prescriptions.length) {
      for (const rx of prescriptions) {
        if (rx.status === "DISPENSED" && !rx._bridgeSynced) {
          await handleFabricEvent("PrescriptionDispensed", rx, contracts);
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function startEventListener(fabric, contracts) {
  if (config.fabric.mode === "mock") {
    log("Fabric mode=mock — using polling bridge");
    setInterval(() => pollMockEvents(fabric, contracts), POLL_INTERVAL_MS);
    await pollMockEvents(fabric, contracts);
    return;
  }

  log("Fabric mode=sdk — registering chaincode event listeners");
  const chaincodes = config.fabric.chaincodes;

  const eventSources = [
    { chaincode: chaincodes.medicalRecord, events: ["MedicalRecordCreated", "MedicalRecordUpdated"] },
    { chaincode: chaincodes.prescription, events: ["PrescriptionCreated", "PrescriptionDispensed"] },
    { chaincode: chaincodes.patientRegistry, events: ["PatientRegistered", "ConsentGranted", "ConsentRevoked"] },
  ];

  for (const { chaincode, events } of eventSources) {
    for (const eventName of events) {
      try {
        await fabric.subscribe(chaincode, eventName, async (payload) => {
          await handleFabricEvent(eventName, payload, contracts);
        });
        log(`Subscribed to ${chaincode}:${eventName}`);
      } catch (err) {
        warn(`Failed to subscribe ${chaincode}:${eventName} — ${err.message}`);
      }
    }
  }
}

async function start() {
  log("Starting MediChain+ Fabric-Ethereum bridge…");

  const fabric =
    config.fabric.mode === "sdk"
      ? new FabricGatewayService(config.fabric)
      : new FabricMockService(config.fabric);

  const contracts = await createContractContext(config);

  const reimbAddr = config.reimbursementAddress;
  const drugAddr = config.drugTraceabilityAddress;

  log(`Reimbursement contract : ${reimbAddr || "(not configured)"}`);
  log(`DrugTraceability contract: ${drugAddr || "(not configured)"}`);
  log(`Fabric mode             : ${config.fabric.mode}`);
  log(`RPC URL                 : ${config.rpcUrl}`);

  await startEventListener(fabric, contracts);
  log("Bridge running — waiting for events…");
}

start().catch((err) => {
  console.error("[bridge] Fatal error:", err);
  setTimeout(() => start(), RECONNECT_DELAY_MS);
});
