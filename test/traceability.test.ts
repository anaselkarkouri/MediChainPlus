/**
 * @file traceability.test.ts
 * @description Full test suite for DrugTraceabilityContract.
 *
 * Coverage:
 *  ✓ Register a drug batch
 *  ✓ Reject duplicate batch registration
 *  ✓ Update drug status
 *  ✓ Reject unauthorised updates
 *  ✓ Verify drug information
 *  ✓ Retrieve full drug history
 *  ✓ Edge-case validations (empty strings, non-existent batches)
 */

import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_ID    = "BATCH-2024-001";
const DRUG_NAME   = "Amoxicillin 500mg";
const MANUFACTURER = "PharmaCorp";

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("DrugTraceabilityContract", function () {
  // ── Fixtures ───────────────────────────────────────────────────────────
  let contract;
  let owner;
  let authorisedUpdater;
  let stranger;

  beforeEach(async function () {
    [owner, authorisedUpdater, stranger] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("DrugTraceabilityContract");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  // ── 1. Drug registration ───────────────────────────────────────────────
  describe("registerDrug", function () {
    it("should register a new drug batch and emit DrugRegistered", async function () {
      await expect(
        contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER)
      )
        .to.emit(contract, "DrugRegistered")
        .withArgs(BATCH_ID, DRUG_NAME, MANUFACTURER, owner.address);
    });

    it("should seed the history with an initial 'Registered' entry", async function () {
      await contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER);

      const [timestamps, statuses, updaters] = await contract.getDrugHistory(BATCH_ID);
      expect(statuses.length).to.equal(1);
      expect(statuses[0]).to.equal("Registered");
      expect(updaters[0]).to.equal(owner.address);
      expect(timestamps[0]).to.be.gt(0);
    });

    it("should revert when registering a duplicate batchId", async function () {
      await contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER);
      await expect(
        contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER)
      ).to.be.revertedWith("DrugTraceabilityContract: batch already registered");
    });

    it("should revert when batchId is empty", async function () {
      await expect(
        contract.connect(owner).registerDrug("", DRUG_NAME, MANUFACTURER)
      ).to.be.revertedWith("DrugTraceabilityContract: batchId cannot be empty");
    });

    it("should revert when name is empty", async function () {
      await expect(
        contract.connect(owner).registerDrug(BATCH_ID, "", MANUFACTURER)
      ).to.be.revertedWith("DrugTraceabilityContract: name cannot be empty");
    });

    it("should revert when manufacturer is empty", async function () {
      await expect(
        contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, "")
      ).to.be.revertedWith("DrugTraceabilityContract: manufacturer cannot be empty");
    });

    it("should allow an authorised updater to register a drug", async function () {
      await contract.connect(owner).setUpdaterAuthorisation(authorisedUpdater.address, true);
      await expect(
        contract.connect(authorisedUpdater).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER)
      ).to.emit(contract, "DrugRegistered");
    });

    it("should revert when a stranger tries to register a drug", async function () {
      await expect(
        contract.connect(stranger).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER)
      ).to.be.revertedWith("DrugTraceabilityContract: caller is not authorised");
    });
  });

  // ── 2. Status updates ─────────────────────────────────────────────────
  describe("updateStatus", function () {
    beforeEach(async function () {
      await contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER);
    });

    it("should append a new status entry and emit DrugUpdated", async function () {
      await expect(contract.connect(owner).updateStatus(BATCH_ID, "In Transit"))
        .to.emit(contract, "DrugUpdated")
        .withArgs(BATCH_ID, "In Transit", owner.address, (v) => v > 0n);
    });

    it("should accumulate history entries in order", async function () {
      const statuses = ["Quality Check", "In Transit", "At Pharmacy", "Dispensed"];
      for (const s of statuses) {
        await contract.connect(owner).updateStatus(BATCH_ID, s);
      }

      const [, returnedStatuses] = await contract.getDrugHistory(BATCH_ID);
      // First entry is the "Registered" seed; subsequent are the updates.
      expect(returnedStatuses.length).to.equal(statuses.length + 1);
      expect(returnedStatuses[1]).to.equal("Quality Check");
      expect(returnedStatuses[4]).to.equal("Dispensed");
    });

    it("should allow an authorised updater to push a status", async function () {
      await contract.connect(owner).setUpdaterAuthorisation(authorisedUpdater.address, true);
      await expect(
        contract.connect(authorisedUpdater).updateStatus(BATCH_ID, "In Transit")
      ).to.emit(contract, "DrugUpdated");
    });

    it("should revert when a stranger tries to update status", async function () {
      await expect(
        contract.connect(stranger).updateStatus(BATCH_ID, "In Transit")
      ).to.be.revertedWith("DrugTraceabilityContract: caller is not authorised");
    });

    it("should revert when status string is empty", async function () {
      await expect(
        contract.connect(owner).updateStatus(BATCH_ID, "")
      ).to.be.revertedWith("DrugTraceabilityContract: status cannot be empty");
    });

    it("should revert when the batch does not exist", async function () {
      await expect(
        contract.connect(owner).updateStatus("NON-EXISTENT-BATCH", "In Transit")
      ).to.be.revertedWith("DrugTraceabilityContract: drug batch not found");
    });
  });

  // ── 3. Drug verification ───────────────────────────────────────────────
  describe("verifyDrug", function () {
    beforeEach(async function () {
      await contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER);
    });

    it("should return correct drug info", async function () {
      const [name, manufacturer, historyCount] = await contract.verifyDrug(BATCH_ID);
      expect(name).to.equal(DRUG_NAME);
      expect(manufacturer).to.equal(MANUFACTURER);
      expect(historyCount).to.equal(1); // initial "Registered" entry
    });

    it("should reflect history count after updates", async function () {
      await contract.connect(owner).updateStatus(BATCH_ID, "In Transit");
      await contract.connect(owner).updateStatus(BATCH_ID, "At Pharmacy");

      const [, , historyCount] = await contract.verifyDrug(BATCH_ID);
      expect(historyCount).to.equal(3); // Registered + 2 updates
    });

    it("should revert for a non-existent batch", async function () {
      await expect(contract.verifyDrug("FAKE-BATCH")).to.be.revertedWith(
        "DrugTraceabilityContract: drug batch not found"
      );
    });
  });

  // ── 4. Drug history retrieval ──────────────────────────────────────────
  describe("getDrugHistory", function () {
    beforeEach(async function () {
      await contract.connect(owner).registerDrug(BATCH_ID, DRUG_NAME, MANUFACTURER);
    });

    it("should return parallel arrays of equal length", async function () {
      await contract.connect(owner).updateStatus(BATCH_ID, "Packaged");
      const [timestamps, statuses, updaters] = await contract.getDrugHistory(BATCH_ID);
      expect(timestamps.length).to.equal(statuses.length);
      expect(statuses.length).to.equal(updaters.length);
      expect(statuses.length).to.equal(2);
    });

    it("should include the updater address for each entry", async function () {
      await contract.connect(owner).setUpdaterAuthorisation(authorisedUpdater.address, true);
      await contract.connect(authorisedUpdater).updateStatus(BATCH_ID, "In Transit");

      const [, , updaters] = await contract.getDrugHistory(BATCH_ID);
      expect(updaters[0]).to.equal(owner.address);          // registration by owner
      expect(updaters[1]).to.equal(authorisedUpdater.address); // update by authorised updater
    });

    it("should revert for a non-existent batch", async function () {
      await expect(contract.getDrugHistory("MISSING")).to.be.revertedWith(
        "DrugTraceabilityContract: drug batch not found"
      );
    });
  });

  // ── 5. Authorisation management ────────────────────────────────────────
  describe("setUpdaterAuthorisation", function () {
    it("should grant and revoke updater rights", async function () {
      await contract.connect(owner).setUpdaterAuthorisation(authorisedUpdater.address, true);
      expect(await contract.isAuthorisedUpdater(authorisedUpdater.address)).to.be.true;

      await contract.connect(owner).setUpdaterAuthorisation(authorisedUpdater.address, false);
      expect(await contract.isAuthorisedUpdater(authorisedUpdater.address)).to.be.false;
    });

    it("should emit UpdaterAuthorisationChanged", async function () {
      await expect(
        contract.connect(owner).setUpdaterAuthorisation(authorisedUpdater.address, true)
      )
        .to.emit(contract, "UpdaterAuthorisationChanged")
        .withArgs(authorisedUpdater.address, true);
    });

    it("should revert when a non-owner tries to set authorisation", async function () {
      await expect(
        contract.connect(stranger).setUpdaterAuthorisation(authorisedUpdater.address, true)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("should revert for the zero address", async function () {
      await expect(
        contract.connect(owner).setUpdaterAuthorisation(ethers.ZeroAddress, true)
      ).to.be.revertedWith("DrugTraceabilityContract: zero address");
    });
  });
});
