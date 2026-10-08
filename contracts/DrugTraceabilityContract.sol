// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DrugTraceabilityContract
 * @author MediChain+ Team
 * @notice Tracks pharmaceutical drug batches across the supply chain for the MediChain+ platform.
 * @dev Each drug batch is identified by a unique string `batchId`.
 *      Authorised actors (owner) register new batches and authorised updaters push status changes.
 *      The full status history is stored immutably on-chain.
 *
 *      Workflow:
 *        1. Owner registers a drug batch via `registerDrug`.
 *        2. Authorised actors push status updates via `updateStatus`.
 *        3. Anyone can read history via `getDrugHistory` or verify existence via `verifyDrug`.
 */
contract DrugTraceabilityContract is Ownable {
    // =========================================================
    // TYPES
    // =========================================================

    /**
     * @notice A single entry in a drug's supply-chain history.
     * @param timestamp  Block timestamp when the update was recorded.
     * @param status     Human-readable status string (e.g. "Manufactured", "In Transit").
     * @param updatedBy  Address of the actor who submitted the update.
     */
    struct HistoryEntry {
        uint256 timestamp;
        string status;
        address updatedBy;
    }

    /**
     * @notice Represents a registered pharmaceutical drug batch.
     * @param batchId      Unique batch identifier string (e.g. "BATCH-2024-001").
     * @param name         Commercial or generic drug name.
     * @param manufacturer Name of the manufacturing entity.
     * @param exists       Guard flag to detect duplicate registration.
     * @param history      Ordered list of status updates from registration onwards.
     */
    struct Drug {
        string batchId;
        string name;
        string manufacturer;
        bool exists;
        HistoryEntry[] history;
    }

    // =========================================================
    // STATE VARIABLES
    // =========================================================

    /// @notice Maps a batchId string to its Drug struct.
    mapping(string => Drug) private _drugs;

    /// @notice Maps addresses to their authorisation to push drug status updates.
    mapping(address => bool) private _authorisedUpdaters;

    // =========================================================
    // EVENTS
    // =========================================================

    /**
     * @notice Emitted when a new drug batch is registered on-chain.
     * @param batchId      Unique batch identifier.
     * @param name         Drug name.
     * @param manufacturer Manufacturer name.
     * @param registeredBy Address that triggered the registration.
     */
    event DrugRegistered(
        string indexed batchId,
        string name,
        string manufacturer,
        address indexed registeredBy
    );

    /**
     * @notice Emitted when a drug batch status is updated.
     * @param batchId   Batch being updated.
     * @param status    New status string.
     * @param updatedBy Address that pushed the update.
     * @param timestamp Block timestamp of the update.
     */
    event DrugUpdated(
        string indexed batchId,
        string status,
        address indexed updatedBy,
        uint256 timestamp
    );

    /**
     * @notice Emitted when an address is granted or revoked updater rights.
     * @param account     The address affected.
     * @param authorised  True if granted, false if revoked.
     */
    event UpdaterAuthorisationChanged(address indexed account, bool authorised);

    // =========================================================
    // MODIFIERS
    // =========================================================

    /**
     * @dev Restricts function access to the owner or an authorised updater.
     */
    modifier onlyAuthorised() {
        require(
            msg.sender == owner() || _authorisedUpdaters[msg.sender],
            "DrugTraceabilityContract: caller is not authorised"
        );
        _;
    }

    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    /**
     * @notice Initialises the contract with the deployer as owner.
     */
    constructor() Ownable(msg.sender) {}

    // =========================================================
    // ADMIN FUNCTIONS
    // =========================================================

    /**
     * @notice Grants or revokes drug-update authorisation for an address.
     * @dev Only callable by the owner.
     * @param account     The address to modify.
     * @param authorised  True to grant, false to revoke.
     */
    function setUpdaterAuthorisation(address account, bool authorised) external onlyOwner {
        require(account != address(0), "DrugTraceabilityContract: zero address");
        _authorisedUpdaters[account] = authorised;
        emit UpdaterAuthorisationChanged(account, authorised);
    }

    // =========================================================
    // EXTERNAL / PUBLIC FUNCTIONS
    // =========================================================

    /**
     * @notice Registers a new pharmaceutical drug batch on-chain.
     * @dev Only callable by the owner or an authorised updater.
     *      Reverts if the batchId is already registered.
     *      Automatically adds an initial "Registered" history entry.
     *      Emits {DrugRegistered}.
     * @param batchId      Unique batch identifier string. Must be non-empty.
     * @param name         Drug name. Must be non-empty.
     * @param manufacturer Manufacturer name. Must be non-empty.
     */
    function registerDrug(
        string calldata batchId,
        string calldata name,
        string calldata manufacturer
    ) external onlyAuthorised {
        require(bytes(batchId).length > 0, "DrugTraceabilityContract: batchId cannot be empty");
        require(bytes(name).length > 0, "DrugTraceabilityContract: name cannot be empty");
        require(bytes(manufacturer).length > 0, "DrugTraceabilityContract: manufacturer cannot be empty");
        require(!_drugs[batchId].exists, "DrugTraceabilityContract: batch already registered");

        Drug storage drug = _drugs[batchId];
        drug.batchId = batchId;
        drug.name = name;
        drug.manufacturer = manufacturer;
        drug.exists = true;

        // Seed the history with the initial registration entry.
        drug.history.push(
            HistoryEntry({
                timestamp: block.timestamp,
                status: "Registered",
                updatedBy: msg.sender
            })
        );

        emit DrugRegistered(batchId, name, manufacturer, msg.sender);
    }

    /**
     * @notice Appends a new status update to an existing drug batch's history.
     * @dev Only callable by the owner or an authorised updater.
     *      History entries are append-only; existing entries cannot be modified.
     *      Emits {DrugUpdated}.
     * @param batchId Batch identifier. Must exist.
     * @param status  New status string. Must be non-empty.
     */
    function updateStatus(string calldata batchId, string calldata status) external onlyAuthorised {
        require(bytes(status).length > 0, "DrugTraceabilityContract: status cannot be empty");

        Drug storage drug = _getExistingDrug(batchId);

        drug.history.push(
            HistoryEntry({
                timestamp: block.timestamp,
                status: status,
                updatedBy: msg.sender
            })
        );

        emit DrugUpdated(batchId, status, msg.sender, block.timestamp);
    }

    /**
     * @notice Returns core information about a drug batch.
     * @param batchId The batch to query. Must exist.
     * @return name         Drug name.
     * @return manufacturer Manufacturer name.
     * @return historyCount Number of history entries recorded.
     */
    function verifyDrug(string calldata batchId)
        external
        view
        returns (
            string memory name,
            string memory manufacturer,
            uint256 historyCount
        )
    {
        Drug storage drug = _getExistingDrug(batchId);
        return (drug.name, drug.manufacturer, drug.history.length);
    }

    /**
     * @notice Returns the full status history of a drug batch.
     * @param batchId The batch to query. Must exist.
     * @return timestamps  Array of block timestamps for each history entry.
     * @return statuses    Array of status strings corresponding to each entry.
     * @return updaters    Array of addresses that submitted each update.
     */
    function getDrugHistory(string calldata batchId)
        external
        view
        returns (
            uint256[] memory timestamps,
            string[] memory statuses,
            address[] memory updaters
        )
    {
        Drug storage drug = _getExistingDrug(batchId);
        uint256 len = drug.history.length;

        timestamps = new uint256[](len);
        statuses   = new string[](len);
        updaters   = new address[](len);

        for (uint256 i = 0; i < len; i++) {
            timestamps[i] = drug.history[i].timestamp;
            statuses[i]   = drug.history[i].status;
            updaters[i]   = drug.history[i].updatedBy;
        }
    }

    /**
     * @notice Checks whether an address is an authorised updater.
     * @param account The address to check.
     * @return True if authorised.
     */
    function isAuthorisedUpdater(address account) external view returns (bool) {
        return _authorisedUpdaters[account];
    }

    // =========================================================
    // INTERNAL HELPERS
    // =========================================================

    /**
     * @dev Retrieves a drug from storage, reverting if the batchId does not exist.
     * @param batchId The batch identifier to look up.
     * @return drug Storage pointer to the Drug struct.
     */
    function _getExistingDrug(string calldata batchId) internal view returns (Drug storage drug) {
        require(bytes(batchId).length > 0, "DrugTraceabilityContract: batchId cannot be empty");
        drug = _drugs[batchId];
        require(drug.exists, "DrugTraceabilityContract: drug batch not found");
    }
}
