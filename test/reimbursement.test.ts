/**
 * @file reimbursement.test.ts
 * @description Full test suite for ReimbursementContract.
 *
 * Coverage:
 *  ✓ Claim submission
 *  ✓ Claim validation (owner only)
 *  ✓ Rejection of unauthorised validation
 *  ✓ Payment execution
 *  ✓ Rejection of duplicate payment
 *  ✓ Rejection of payment on non-approved claim
 */

import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Wei value for 1 ETH */
const ONE_ETH = ethers.parseEther("1");

/** Wei value for 0.5 ETH */
const HALF_ETH = ethers.parseEther("0.5");

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("ReimbursementContract", function () {
  // ── Fixtures ───────────────────────────────────────────────────────────
  let contract;
  let owner;
  let patient;
  let stranger;

  beforeEach(async function () {
    [owner, patient, stranger] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ReimbursementContract");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Fund the contract so it can execute payments.
    await owner.sendTransaction({
      to: await contract.getAddress(),
      value: ONE_ETH,
    });
  });

  // ── 1. Claim submission ────────────────────────────────────────────────
  describe("submitClaim", function () {
    it("should allow a patient to submit a claim and emit ClaimSubmitted", async function () {
      const claimAmount = HALF_ETH;

      await expect(contract.connect(patient).submitClaim(claimAmount))
        .to.emit(contract, "ClaimSubmitted")
        .withArgs(0, patient.address, claimAmount);

      const [id, addr, amount, approved, paid] = await contract.getClaim(0);
      expect(id).to.equal(0);
      expect(addr).to.equal(patient.address);
      expect(amount).to.equal(claimAmount);
      expect(approved).to.be.false;
      expect(paid).to.be.false;
    });

    it("should auto-increment claim IDs", async function () {
      await contract.connect(patient).submitClaim(HALF_ETH);
      await contract.connect(patient).submitClaim(HALF_ETH);

      const [id0] = await contract.getClaim(0);
      const [id1] = await contract.getClaim(1);
      expect(id0).to.equal(0);
      expect(id1).to.equal(1);

      expect(await contract.totalClaims()).to.equal(2);
    });

    it("should revert when amount is zero", async function () {
      await expect(contract.connect(patient).submitClaim(0)).to.be.revertedWith(
        "ReimbursementContract: amount must be greater than zero"
      );
    });

    it("should allow owner gateway to submit a claim for the authenticated patient", async function () {
      await expect(contract.connect(owner).submitClaimFor(patient.address, HALF_ETH))
        .to.emit(contract, "ClaimSubmitted")
        .withArgs(0, patient.address, HALF_ETH);

      const [, addr, amount, approved, paid] = await contract.getClaim(0);
      expect(addr).to.equal(patient.address);
      expect(amount).to.equal(HALF_ETH);
      expect(approved).to.be.false;
      expect(paid).to.be.false;
    });

    it("should reject non-owner gateway claim submission", async function () {
      await expect(
        contract.connect(stranger).submitClaimFor(patient.address, HALF_ETH)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("should reject zero patient address in gateway claim submission", async function () {
      await expect(
        contract.connect(owner).submitClaimFor(ethers.ZeroAddress, HALF_ETH)
      ).to.be.revertedWith("ReimbursementContract: patient cannot be zero address");
    });
  });

  // ── 2. Claim validation ────────────────────────────────────────────────
  describe("validateClaim", function () {
    beforeEach(async function () {
      await contract.connect(patient).submitClaim(HALF_ETH);
    });

    it("should allow the owner to validate a claim and emit ClaimApproved", async function () {
      await expect(contract.connect(owner).validateClaim(0))
        .to.emit(contract, "ClaimApproved")
        .withArgs(0);

      const [, , , approved] = await contract.getClaim(0);
      expect(approved).to.be.true;
    });

    it("should revert when a non-owner tries to validate", async function () {
      await expect(
        contract.connect(stranger).validateClaim(0)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("should revert when validating the same claim twice", async function () {
      await contract.connect(owner).validateClaim(0);
      await expect(contract.connect(owner).validateClaim(0)).to.be.revertedWith(
        "ReimbursementContract: claim already approved"
      );
    });

    it("should revert when validating a non-existent claim", async function () {
      await expect(contract.connect(owner).validateClaim(999)).to.be.revertedWith(
        "ReimbursementContract: claim does not exist"
      );
    });
  });

  // ── 3. Payment execution ───────────────────────────────────────────────
  describe("executePayment", function () {
    beforeEach(async function () {
      await contract.connect(patient).submitClaim(HALF_ETH);
      await contract.connect(owner).validateClaim(0);
    });

    it("should transfer ETH to the patient and emit PaymentExecuted", async function () {
      const patientBefore = await ethers.provider.getBalance(patient.address);

      await expect(contract.connect(owner).executePayment(0))
        .to.emit(contract, "PaymentExecuted")
        .withArgs(0, patient.address, HALF_ETH);

      const patientAfter = await ethers.provider.getBalance(patient.address);
      expect(patientAfter - patientBefore).to.equal(HALF_ETH);

      const [, , , , paid] = await contract.getClaim(0);
      expect(paid).to.be.true;
    });

    it("should revert on duplicate payment (paid flag protection)", async function () {
      await contract.connect(owner).executePayment(0);
      await expect(contract.connect(owner).executePayment(0)).to.be.revertedWith(
        "ReimbursementContract: payment already executed"
      );
    });

    it("should revert when trying to pay a non-approved claim", async function () {
      // Submit a second claim but do NOT approve it.
      await contract.connect(patient).submitClaim(HALF_ETH);
      await expect(contract.connect(owner).executePayment(1)).to.be.revertedWith(
        "ReimbursementContract: claim not approved"
      );
    });

    it("should revert when contract balance is insufficient", async function () {
      // Submit and approve a claim larger than the contract balance.
      const hugeAmount = ethers.parseEther("100");
      await contract.connect(patient).submitClaim(hugeAmount);
      await contract.connect(owner).validateClaim(1);

      await expect(contract.connect(owner).executePayment(1)).to.be.revertedWith(
        "ReimbursementContract: insufficient contract balance"
      );
    });

    it("should revert when a non-owner tries to execute payment", async function () {
      await expect(
        contract.connect(stranger).executePayment(0)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ── 4. Contract receives ETH ───────────────────────────────────────────
  describe("receive()", function () {
    it("should accept ETH transfers to the contract", async function () {
      const contractAddress = await contract.getAddress();
      const before = await ethers.provider.getBalance(contractAddress);

      await owner.sendTransaction({ to: contractAddress, value: ONE_ETH });

      const after = await ethers.provider.getBalance(contractAddress);
      expect(after - before).to.equal(ONE_ETH);
    });
  });
});
