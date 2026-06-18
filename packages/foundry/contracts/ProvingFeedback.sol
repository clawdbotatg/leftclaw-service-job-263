// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IProvingStamp {
    function hasClaimed(uint256 buildId, address wallet) external view returns (bool);
}

/**
 * @title ProvingFeedback
 * @notice Proof-of-use-gated reviews. Only wallets that hold the proving stamp for a
 *         given build may submit feedback. Anyone can tip reviewers in CLAWD.
 */
contract ProvingFeedback is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Feedback {
        uint256 buildId;
        address reviewer;
        string reviewText;
        uint8 rating;
        uint256 totalTipsReceived;
        uint256 timestamp;
    }

    IProvingStamp public immutable stamp;
    IERC20 public immutable clawd;

    uint256 public feedbackCount;
    mapping(uint256 => Feedback) public feedbackById;
    mapping(uint256 => mapping(address => bool)) public hasFeedback;
    mapping(uint256 => uint256[]) public buildFeedbackIds;

    event FeedbackSubmitted(
        uint256 indexed feedbackId, uint256 indexed buildId, address indexed reviewer, uint8 rating
    );
    event ReviewerTipped(
        uint256 indexed feedbackId, address indexed tipper, address indexed reviewer, uint256 amount
    );

    error NotStampHolder();
    error AlreadyReviewed();
    error InvalidRating();
    error ReviewTooLong();
    error InvalidFeedbackId();
    error ZeroTip();
    error ZeroAddress();

    constructor(address _stamp, address _clawd, address initialOwner) Ownable(initialOwner) {
        if (_stamp == address(0) || _clawd == address(0)) revert ZeroAddress();
        stamp = IProvingStamp(_stamp);
        clawd = IERC20(_clawd);
    }

    /**
     * @notice Submit a review for a build. Caller must hold the proving stamp for
     *         that build. One review per (build, wallet).
     */
    function submitFeedback(uint256 buildId, uint8 rating, string calldata reviewText)
        external
        returns (uint256 feedbackId)
    {
        if (!stamp.hasClaimed(buildId, msg.sender)) revert NotStampHolder();
        if (hasFeedback[buildId][msg.sender]) revert AlreadyReviewed();
        if (rating < 1 || rating > 5) revert InvalidRating();
        if (bytes(reviewText).length > 512) revert ReviewTooLong();

        feedbackId = feedbackCount;
        feedbackById[feedbackId] = Feedback({
            buildId: buildId,
            reviewer: msg.sender,
            reviewText: reviewText,
            rating: rating,
            totalTipsReceived: 0,
            timestamp: block.timestamp
        });
        hasFeedback[buildId][msg.sender] = true;
        buildFeedbackIds[buildId].push(feedbackId);
        unchecked {
            feedbackCount = feedbackId + 1;
        }

        emit FeedbackSubmitted(feedbackId, buildId, msg.sender, rating);
    }

    /**
     * @notice Tip the reviewer for a feedback entry. CLAWD is pulled from the caller
     *         and transferred directly to the reviewer (no escrow).
     */
    function tipReviewer(uint256 feedbackId, uint256 amount) external nonReentrant {
        if (feedbackId >= feedbackCount) revert InvalidFeedbackId();
        if (amount == 0) revert ZeroTip();

        Feedback storage feedback = feedbackById[feedbackId];
        address reviewer = feedback.reviewer;

        // Effects first.
        feedback.totalTipsReceived += amount;

        emit ReviewerTipped(feedbackId, msg.sender, reviewer, amount);

        // Interaction.
        clawd.safeTransferFrom(msg.sender, reviewer, amount);
    }

    function getFeedbackForBuild(uint256 buildId) external view returns (uint256[] memory) {
        return buildFeedbackIds[buildId];
    }

    function getFeedback(uint256 feedbackId) external view returns (Feedback memory) {
        return feedbackById[feedbackId];
    }
}
