// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProvingGroundsRegistry
 * @notice Central registry for LeftClaw-verified builds. Handles build registration
 *         (burns CLAWD to 0xdead), bounty pool management, and bounty distribution to
 *         stamp claimers.
 */
contract ProvingGroundsRegistry is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant BURN_ADDRESS = address(0xdead);

    struct Build {
        address contractAddress;
        address builder;
        uint256 bountyPool;
        uint256 bountyPerClaimer;
        uint256 maxClaimers;
        uint256 claimerCount;
        bool active;
    }

    IERC20 public immutable clawd;
    uint256 public registrationBurnAmount;
    uint256 public buildCount;
    mapping(uint256 => Build) public builds;
    address public stampContract;

    event BuildRegistered(
        uint256 indexed buildId,
        address indexed builder,
        address indexed contractAddress,
        uint256 bountyPerClaimer,
        uint256 maxClaimers,
        uint256 bountyPool
    );
    event BountyPoolFunded(uint256 indexed buildId, address indexed funder, uint256 amount, uint256 newPool);
    event BountyClaimed(uint256 indexed buildId, address indexed claimer, uint256 amount, uint256 remainingPool);
    event BuildDeactivated(uint256 indexed buildId);
    event StampContractSet(address indexed previousStamp, address indexed newStamp);
    event RegistrationBurnAmountSet(uint256 previousAmount, uint256 newAmount);

    error NotStampContract();
    error BuildDoesNotExist();
    error ZeroAddress();

    modifier onlyStamp() {
        if (msg.sender != stampContract) revert NotStampContract();
        _;
    }

    constructor(address initialOwner, address _clawd, uint256 _registrationBurnAmount) Ownable(initialOwner) {
        if (_clawd == address(0)) revert ZeroAddress();
        clawd = IERC20(_clawd);
        registrationBurnAmount = _registrationBurnAmount;
    }

    /**
     * @notice Register a new build. Burns `registrationBurnAmount` CLAWD from the caller
     *         and pulls `bountyPerClaimer * maxClaimers` CLAWD into the registry as the
     *         initial bounty pool.
     */
    function registerBuild(address contractAddress, uint256 bountyPerClaimer, uint256 maxClaimers)
        external
        nonReentrant
        returns (uint256 buildId)
    {
        if (contractAddress == address(0)) revert ZeroAddress();

        uint256 bountyPool = bountyPerClaimer * maxClaimers;

        buildId = buildCount;
        builds[buildId] = Build({
            contractAddress: contractAddress,
            builder: msg.sender,
            bountyPool: bountyPool,
            bountyPerClaimer: bountyPerClaimer,
            maxClaimers: maxClaimers,
            claimerCount: 0,
            active: true
        });
        unchecked {
            buildCount = buildId + 1;
        }

        emit BuildRegistered(buildId, msg.sender, contractAddress, bountyPerClaimer, maxClaimers, bountyPool);

        // External interactions last (CEI).
        uint256 burnAmount = registrationBurnAmount;
        if (burnAmount > 0) {
            clawd.safeTransferFrom(msg.sender, BURN_ADDRESS, burnAmount);
        }
        if (bountyPool > 0) {
            clawd.safeTransferFrom(msg.sender, address(this), bountyPool);
        }
    }

    /**
     * @notice Add additional CLAWD to a build's bounty pool.
     */
    function fundBountyPool(uint256 buildId, uint256 amount) external nonReentrant {
        Build storage build = builds[buildId];
        if (build.contractAddress == address(0)) revert BuildDoesNotExist();

        uint256 newPool = build.bountyPool + amount;
        build.bountyPool = newPool;

        emit BountyPoolFunded(buildId, msg.sender, amount, newPool);

        clawd.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Pay out a bounty to a stamp claimer. Only callable by the stamp contract.
     *         Silently no-ops when the build is inactive, has reached maxClaimers, or
     *         the pool is depleted — this allows stamps to mint even after rewards run out.
     */
    function claimBounty(uint256 buildId, address claimer) external nonReentrant onlyStamp {
        Build storage build = builds[buildId];
        if (build.contractAddress == address(0)) revert BuildDoesNotExist();

        uint256 perClaimer = build.bountyPerClaimer;
        if (
            !build.active || build.claimerCount >= build.maxClaimers || perClaimer == 0
                || build.bountyPool < perClaimer
        ) {
            return;
        }

        // Effects.
        build.claimerCount += 1;
        uint256 remaining = build.bountyPool - perClaimer;
        build.bountyPool = remaining;

        emit BountyClaimed(buildId, claimer, perClaimer, remaining);

        // Interaction.
        clawd.safeTransfer(claimer, perClaimer);
    }

    function setRegistrationBurnAmount(uint256 amount) external onlyOwner {
        emit RegistrationBurnAmountSet(registrationBurnAmount, amount);
        registrationBurnAmount = amount;
    }

    function deactivateBuild(uint256 buildId) external onlyOwner {
        Build storage build = builds[buildId];
        if (build.contractAddress == address(0)) revert BuildDoesNotExist();
        build.active = false;
        emit BuildDeactivated(buildId);
    }

    function setStampContract(address _stampContract) external onlyOwner {
        if (_stampContract == address(0)) revert ZeroAddress();
        emit StampContractSet(stampContract, _stampContract);
        stampContract = _stampContract;
    }

    function getBuild(uint256 buildId) external view returns (Build memory) {
        return builds[buildId];
    }
}
