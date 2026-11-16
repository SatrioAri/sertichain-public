// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";

/// @title SertiChain
/// @notice Issues campus event certificates as soulbound ERC-721 tokens (ERC-5192).
/// @dev Personal data (name, NIM, email) never goes on-chain; only the file hash and its IPFS CID.
contract SertiChain is ERC721, AccessControl, Pausable, IERC5192 {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    uint256 public constant MAX_TEXT_LENGTH = 200;
    uint256 public constant MAX_CID_LENGTH = 100;

    struct Certificate {
        address issuer;
        address recipient;
        string title;
        string certType;
        uint64 eventDate;
        uint64 issuedAt;
        bytes32 fileHash;
        string fileCID;
        bool revoked;
        string revokeReason;
        uint64 revokedAt;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Certificate) private _certificates;
    mapping(address => uint256[]) private _certificatesByOwner;

    /// @notice Certificate id for a given file hash, 0 if none. One file can back only one certificate.
    mapping(bytes32 => uint256) public certificateIdByFileHash;

    event IssuerAdded(address indexed account, address indexed admin);
    event IssuerRemoved(address indexed account, address indexed admin);
    event CertificateIssued(
        uint256 indexed id,
        address indexed issuer,
        address indexed recipient,
        bytes32 fileHash
    );
    event CertificateUpdated(uint256 indexed id, address indexed issuer);
    event CertificateRevoked(uint256 indexed id, address indexed revokedBy, string reason);

    error ZeroAddress();
    error AdminCannotBeIssuer(address account);
    error SelfIssuance();
    error EmptyField(string field);
    error TextTooLong(string field);
    error InvalidEventDate();
    error EmptyFileHash();
    error DuplicateFileHash(uint256 existingId);
    error CertificateNotFound(uint256 id);
    error CertificateAlreadyRevoked(uint256 id);
    error NotCertificateIssuer(uint256 id, address caller);
    error NotAllowedToRevoke(uint256 id, address caller);
    error Soulbound();

    constructor(address admin) ERC721("SertiChain Certificate", "SERTI") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // Issuer management

    function addIssuer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        _grantRole(ISSUER_ROLE, account);
        emit IssuerAdded(account, msg.sender);
    }

    function removeIssuer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ISSUER_ROLE, account);
        emit IssuerRemoved(account, msg.sender);
    }

    /// @dev Enforced here rather than in addIssuer, so the public grantRole cannot bypass it.
    /// Separation of duties: an admin wallet can never issue certificates.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == ISSUER_ROLE && hasRole(DEFAULT_ADMIN_ROLE, account)) {
            revert AdminCannotBeIssuer(account);
        }
        if (role == DEFAULT_ADMIN_ROLE && hasRole(ISSUER_ROLE, account)) {
            revert AdminCannotBeIssuer(account);
        }
        return super._grantRole(role, account);
    }

    // Certificate lifecycle

    function issueCertificate(
        address recipient,
        string calldata title,
        string calldata certType,
        uint64 eventDate,
        bytes32 fileHash,
        string calldata fileCID
    ) external onlyRole(ISSUER_ROLE) whenNotPaused returns (uint256 id) {
        if (recipient == address(0)) revert ZeroAddress();
        if (recipient == msg.sender) revert SelfIssuance();
        _validateDetails(title, certType, eventDate);
        if (fileHash == bytes32(0)) revert EmptyFileHash();
        _validateText(fileCID, "fileCID", MAX_CID_LENGTH);

        uint256 existingId = certificateIdByFileHash[fileHash];
        if (existingId != 0) revert DuplicateFileHash(existingId);

        id = _nextId++;
        _certificates[id] = Certificate({
            issuer: msg.sender,
            recipient: recipient,
            title: title,
            certType: certType,
            eventDate: eventDate,
            issuedAt: uint64(block.timestamp),
            fileHash: fileHash,
            fileCID: fileCID,
            revoked: false,
            revokeReason: "",
            revokedAt: 0
        });
        _certificatesByOwner[recipient].push(id);
        certificateIdByFileHash[fileHash] = id;

        // _mint, not _safeMint: _safeMint calls back into the recipient and opens a reentrancy path.
        _mint(recipient, id);

        emit Locked(id);
        emit CertificateIssued(id, msg.sender, recipient, fileHash);
    }

    /// @notice Fixes descriptive fields only. A wrong recipient or file means revoke and issue again.
    function updateCertificate(
        uint256 id,
        string calldata title,
        string calldata certType,
        uint64 eventDate
    ) external onlyRole(ISSUER_ROLE) whenNotPaused {
        Certificate storage cert = _getExisting(id);
        if (cert.issuer != msg.sender) revert NotCertificateIssuer(id, msg.sender);
        if (cert.revoked) revert CertificateAlreadyRevoked(id);
        _validateDetails(title, certType, eventDate);

        cert.title = title;
        cert.certType = certType;
        cert.eventDate = eventDate;

        emit CertificateUpdated(id, msg.sender);
    }

    /// @notice Soft delete: the record and token stay, marked as revoked with a reason.
    /// @dev Callable by the original issuer (while still an issuer) or by any admin.
    function revokeCertificate(uint256 id, string calldata reason) external whenNotPaused {
        Certificate storage cert = _getExisting(id);
        if (cert.revoked) revert CertificateAlreadyRevoked(id);

        bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        bool isOwnIssuer = hasRole(ISSUER_ROLE, msg.sender) && cert.issuer == msg.sender;
        if (!isAdmin && !isOwnIssuer) revert NotAllowedToRevoke(id, msg.sender);

        _validateText(reason, "reason", MAX_TEXT_LENGTH);

        cert.revoked = true;
        cert.revokeReason = reason;
        cert.revokedAt = uint64(block.timestamp);

        emit CertificateRevoked(id, msg.sender, reason);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Views

    function getCertificate(uint256 id) external view returns (Certificate memory) {
        return _getExisting(id);
    }

    function getCertificatesByOwner(address owner) external view returns (uint256[] memory) {
        return _certificatesByOwner[owner];
    }

    /// @notice True only if the certificate exists, is not revoked, and the hash matches.
    function verifyFile(uint256 id, bytes32 fileHash) external view returns (bool) {
        Certificate storage cert = _certificates[id];
        if (cert.issuer == address(0)) return false;
        return !cert.revoked && cert.fileHash == fileHash;
    }

    function totalCertificates() external view returns (uint256) {
        return _nextId - 1;
    }

    // ERC-5192 soulbound behaviour

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @dev Allows minting only. Transfers and burns revert, so a certificate stays with its recipient.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    // Internal helpers

    function _getExisting(uint256 id) private view returns (Certificate storage cert) {
        cert = _certificates[id];
        if (cert.issuer == address(0)) revert CertificateNotFound(id);
    }

    function _validateDetails(string calldata title, string calldata certType, uint64 eventDate) private view {
        _validateText(title, "title", MAX_TEXT_LENGTH);
        _validateText(certType, "certType", MAX_TEXT_LENGTH);
        if (eventDate == 0 || eventDate > block.timestamp) revert InvalidEventDate();
    }

    function _validateText(string calldata value, string memory field, uint256 maxLength) private pure {
        uint256 length = bytes(value).length;
        if (length == 0) revert EmptyField(field);
        if (length > maxLength) revert TextTooLong(field);
    }
}
