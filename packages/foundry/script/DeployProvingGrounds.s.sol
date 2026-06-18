// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { ProvingGroundsRegistry } from "../contracts/ProvingGroundsRegistry.sol";
import { ProvingStamp } from "../contracts/ProvingStamp.sol";
import { ProvingFeedback } from "../contracts/ProvingFeedback.sol";

/**
 * @notice Deploys the Proving Grounds contract suite and hands ownership over to the client.
 *
 * Flow:
 *   1. Deploy ProvingGroundsRegistry(deployer, CLAWD, INITIAL_BURN)
 *   2. Deploy ProvingStamp(registry, deployer)
 *   3. Deploy ProvingFeedback(stamp, CLAWD, deployer)
 *   4. registry.setStampContract(stamp)
 *   5. Transfer ownership of all three contracts to CLIENT (Ownable2Step — CLIENT must
 *      call acceptOwnership() on each).
 *
 * Example:
 *   yarn deploy --file DeployProvingGrounds.s.sol --network base
 */
contract DeployProvingGrounds is ScaffoldETHDeploy {
    address internal constant CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
    address internal constant CLIENT = 0x34aA3F359A9D614239015126635CE7732c18fDF3;
    uint256 internal constant INITIAL_BURN = 100 * 1e18;

    function run() external ScaffoldEthDeployerRunner {
        ProvingGroundsRegistry registry = new ProvingGroundsRegistry(deployer, CLAWD, INITIAL_BURN);
        deployments.push(Deployment({ name: "ProvingGroundsRegistry", addr: address(registry) }));

        ProvingStamp stamp = new ProvingStamp(address(registry), deployer);
        deployments.push(Deployment({ name: "ProvingStamp", addr: address(stamp) }));

        ProvingFeedback feedback = new ProvingFeedback(address(stamp), CLAWD, deployer);
        deployments.push(Deployment({ name: "ProvingFeedback", addr: address(feedback) }));

        registry.setStampContract(address(stamp));

        // Hand off to the client wallet. CLIENT must acceptOwnership() on each.
        registry.transferOwnership(CLIENT);
        stamp.transferOwnership(CLIENT);
        feedback.transferOwnership(CLIENT);
    }
}
