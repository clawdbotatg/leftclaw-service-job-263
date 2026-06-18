// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IProvingGroundsRegistry {
    struct Build {
        address contractAddress;
        address builder;
        uint256 bountyPool;
        uint256 bountyPerClaimer;
        uint256 maxClaimers;
        uint256 claimerCount;
        bool active;
    }

    function getBuild(uint256 buildId) external view returns (Build memory);
    function claimBounty(uint256 buildId, address claimer) external;
}

/**
 * @title ProvingStamp
 * @notice Soulbound ERC721 — one stamp per wallet per build. Each mint triggers a
 *         bounty payout from the registry to the claimer. Transfers are disabled
 *         (only minting is allowed).
 */
contract ProvingStamp is ERC721, Ownable2Step, ReentrancyGuard {
    struct TokenMetadata {
        uint256 buildId;
        uint256 claimedAt;
    }

    IProvingGroundsRegistry public immutable registry;
    uint256 private _tokenCounter;

    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => TokenMetadata) public tokenMetadata;

    event StampClaimed(
        uint256 indexed tokenId, uint256 indexed buildId, address indexed claimer, uint256 claimedAt
    );

    error AlreadyClaimed();
    error BuildNotActive();
    error TokenDoesNotExist();
    error SoulboundNonTransferable();
    error ZeroAddress();

    constructor(address _registry, address initialOwner)
        ERC721("Proving Stamp", "STAMP")
        Ownable(initialOwner)
    {
        if (_registry == address(0)) revert ZeroAddress();
        registry = IProvingGroundsRegistry(_registry);
    }

    /**
     * @notice Self-report interaction with a build to mint a stamp. The stamp is
     *         soulbound. After mint, the registry attempts to pay out a bounty.
     */
    function claimStamp(uint256 buildId) external nonReentrant returns (uint256 tokenId) {
        if (hasClaimed[buildId][msg.sender]) revert AlreadyClaimed();

        IProvingGroundsRegistry.Build memory build = registry.getBuild(buildId);
        if (!build.active) revert BuildNotActive();

        // Effects.
        hasClaimed[buildId][msg.sender] = true;
        tokenId = _tokenCounter;
        unchecked {
            _tokenCounter = tokenId + 1;
        }
        uint256 claimedAt = block.timestamp;
        tokenMetadata[tokenId] = TokenMetadata({ buildId: buildId, claimedAt: claimedAt });

        _mint(msg.sender, tokenId);

        emit StampClaimed(tokenId, buildId, msg.sender, claimedAt);

        // Interaction: trigger bounty payout. The registry no-ops if the pool is
        // depleted or the build is inactive, so mints still succeed.
        registry.claimBounty(buildId, msg.sender);
    }

    function totalSupply() external view returns (uint256) {
        return _tokenCounter;
    }

    /**
     * @dev Soulbound: only minting (from == address(0)) is permitted. Transfers and
     *      burns revert.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (_ownerOf(tokenId) != address(0)) revert SoulboundNonTransferable();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        TokenMetadata memory meta = tokenMetadata[tokenId];

        return string(
            abi.encodePacked(
                "data:application/json;utf8,",
                "{\"name\":\"Proving Stamp #",
                _toString(tokenId),
                "\",\"description\":\"LeftClaw Proving Grounds stamp for verified interaction with build #",
                _toString(meta.buildId),
                "\",\"attributes\":[{\"trait_type\":\"buildId\",\"value\":",
                _toString(meta.buildId),
                "},{\"trait_type\":\"claimedAt\",\"value\":",
                _toString(meta.claimedAt),
                "}]}"
            )
        );
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // value % 10 is in [0, 9], so the cast to uint8 cannot truncate.
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
