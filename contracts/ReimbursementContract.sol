// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ReimbursementContract
 * @author MediChain+ Team
 * @notice Automates insurance reimbursement payments on-chain for the MediChain+ healthcare platform.
 * @dev Implements claim lifecycle: submission → validation → payment.
 *      Uses OpenZeppelin Ownable for access control and ReentrancyGuard for payment safety.
 *
 *      Workflow:
 *        1. Patient submits a claim via `submitClaim`.
 *        2. Insurance owner validates it via `validateClaim`.
 *        3. Validated claim triggers payment via `executePayment`.
 */
contract ReimbursementContract is Ownable, ReentrancyGuard {
    // =========================================================
    // TYPES
    // =========================================================

    /**
     * @notice Represents a single insurance reimbursement claim.
     * @param id          Unique auto-incremented claim identifier.
     * @param patient     Ethereum address of the patient who submitted the claim.
     * @param amount      Reimbursement amount in wei.
     * @param approved    Whether the insurance owner has validated this claim.
     * @param paid        Whether the reimbursement has been executed.
     */
    struct Claim {
        uint256 id;
        address patient;
        uint256 amount;
        bool approved;
        bool paid;
    }

    // =========================================================
    // STATE VARIABLES
    // =========================================================

    /// @notice Auto-incrementing counter used to generate unique claim IDs.
    uint256 private _nextClaimId;

    /// @notice Maps claim ID to its Claim struct.
    mapping(uint256 => Claim) private _claims;

    // =========================================================
    // EVENTS
    // =========================================================

    /**
     * @notice Emitted when a patient submits a new claim.
     * @param claimId  The newly assigned claim ID.
     * @param patient  Address of the patient.
     * @param amount   Requested reimbursement amount in wei.
     */
    event ClaimSubmitted(uint256 indexed claimId, address indexed patient, uint256 amount);

    /**
     * @notice Emitted when the owner approves a claim.
     * @param claimId  The approved claim ID.
     */
    event ClaimApproved(uint256 indexed claimId);

    /**
     * @notice Emitted when a reimbursement payment is successfully executed.
     * @param claimId  The paid claim ID.
     * @param patient  Recipient address.
     * @param amount   Amount transferred in wei.
     */
    event PaymentExecuted(uint256 indexed claimId, address indexed patient, uint256 amount);

    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    /**
     * @notice Initialises the contract, setting the deployer as the insurance owner.
     */
    constructor() Ownable(msg.sender) {}

    // =========================================================
    // EXTERNAL / PUBLIC FUNCTIONS
    // =========================================================

    /**
     * @notice Allows any patient to submit a reimbursement claim.
     * @dev The claim is stored with `approved = false` and `paid = false`.
     *      Emits {ClaimSubmitted}.
     * @param amount Requested reimbursement amount in wei. Must be greater than zero.
     * @return claimId The ID assigned to the new claim.
     */
    function submitClaim(uint256 amount) external returns (uint256 claimId) {
        claimId = _createClaim(msg.sender, amount);
    }

    /**
     * @notice Allows the gateway owner to submit a claim for an authenticated patient wallet.
     * @dev Keeps direct patient self-submission available while making API-mediated claims
     *      record the real patient address instead of the backend signer address.
     * @param patient Wallet address of the patient.
     * @param amount Requested reimbursement amount in wei. Must be greater than zero.
     * @return claimId The ID assigned to the new claim.
     */
    function submitClaimFor(address patient, uint256 amount) external onlyOwner returns (uint256 claimId) {
        require(patient != address(0), "ReimbursementContract: patient cannot be zero address");
        claimId = _createClaim(patient, amount);
    }

    function _createClaim(address patient, uint256 amount) internal returns (uint256 claimId) {
        require(amount > 0, "ReimbursementContract: amount must be greater than zero");

        claimId = _nextClaimId;
        _nextClaimId++;

        _claims[claimId] = Claim({
            id: claimId,
            patient: patient,
            amount: amount,
            approved: false,
            paid: false
        });

        emit ClaimSubmitted(claimId, patient, amount);
    }

    /**
     * @notice Validates (approves) a pending claim.
     * @dev Only callable by the contract owner (insurance authority).
     *      Emits {ClaimApproved}.
     * @param claimId The ID of the claim to approve.
     */
    function validateClaim(uint256 claimId) external onlyOwner {
        Claim storage claim = _getExistingClaim(claimId);
        require(!claim.approved, "ReimbursementContract: claim already approved");
        require(!claim.paid, "ReimbursementContract: claim already paid");

        claim.approved = true;

        emit ClaimApproved(claimId);
    }

    /**
     * @notice Executes the reimbursement payment for an approved claim.
     * @dev Transfers ETH from the contract balance to the patient.
     *      Protected against reentrancy via {ReentrancyGuard}.
     *      Emits {PaymentExecuted}.
     * @param claimId The ID of the approved claim to pay.
     */
    function executePayment(uint256 claimId) external nonReentrant onlyOwner {
        Claim storage claim = _getExistingClaim(claimId);
        require(claim.approved, "ReimbursementContract: claim not approved");
        require(!claim.paid, "ReimbursementContract: payment already executed");
        require(address(this).balance >= claim.amount, "ReimbursementContract: insufficient contract balance");

        claim.paid = true;

        (bool success, ) = payable(claim.patient).call{value: claim.amount}("");
        require(success, "ReimbursementContract: ETH transfer failed");

        emit PaymentExecuted(claimId, claim.patient, claim.amount);
    }

    /**
     * @notice Returns the full details of a claim.
     * @param claimId The ID of the claim to retrieve.
     * @return id       Claim identifier.
     * @return patient  Patient address.
     * @return amount   Reimbursement amount in wei.
     * @return approved Whether the claim has been validated.
     * @return paid     Whether the reimbursement has been paid.
     */
    function getClaim(uint256 claimId)
        external
        view
        returns (
            uint256 id,
            address patient,
            uint256 amount,
            bool approved,
            bool paid
        )
    {
        Claim storage claim = _getExistingClaim(claimId);
        return (claim.id, claim.patient, claim.amount, claim.approved, claim.paid);
    }

    /**
     * @notice Returns the total number of claims ever submitted.
     * @return count Current claim counter value.
     */
    function totalClaims() external view returns (uint256 count) {
        return _nextClaimId;
    }

    // =========================================================
    // RECEIVE / FALLBACK — allow contract to hold ETH for payouts
    // =========================================================

    /// @notice Allows the contract to receive ETH (e.g., from the insurer).
    receive() external payable {}

    // =========================================================
    // INTERNAL HELPERS
    // =========================================================

    /**
     * @dev Retrieves a claim from storage, reverting if the ID does not exist.
     * @param claimId The claim ID to look up.
     * @return claim Storage pointer to the Claim struct.
     */
    function _getExistingClaim(uint256 claimId) internal view returns (Claim storage claim) {
        require(claimId < _nextClaimId, "ReimbursementContract: claim does not exist");
        return _claims[claimId];
    }
}
