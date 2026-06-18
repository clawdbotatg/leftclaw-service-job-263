"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AddressInput } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
  useWriteAndOpen,
} from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const APPROVE_COOLDOWN_MS = 5000;

const RegisterPage: NextPage = () => {
  const router = useRouter();
  const { address, isConnected, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { writeAndOpen } = useWriteAndOpen();

  const [contractAddress, setContractAddress] = useState<string>("");
  const [bountyPerClaimer, setBountyPerClaimer] = useState<string>("0");
  const [maxClaimers, setMaxClaimers] = useState<string>("1");

  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approveCooldown, setApproveCooldown] = useState(false);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ProvingGroundsRegistry" });
  const registryAddress = registryInfo?.address;

  const { data: registrationBurnAmount } = useScaffoldReadContract({
    contractName: "ProvingGroundsRegistry",
    functionName: "registrationBurnAmount",
  });

  let bountyPerClaimerWei = 0n;
  try {
    bountyPerClaimerWei = parseEther(bountyPerClaimer || "0");
  } catch {
    bountyPerClaimerWei = 0n;
  }

  let maxClaimersBig = 0n;
  try {
    const n = BigInt(maxClaimers || "0");
    maxClaimersBig = n < 0n ? 0n : n;
  } catch {
    maxClaimersBig = 0n;
  }

  const bountyTotal = bountyPerClaimerWei * maxClaimersBig;
  const totalNeeded = (registrationBurnAmount ?? 0n) + bountyTotal;

  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, registryAddress],
  });

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address],
  });

  const needsApproval = (allowance ?? 0n) < totalNeeded;
  const onWrongNetwork = isConnected && chain?.id !== targetNetwork.id;

  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { writeContractAsync: writeRegistry } = useScaffoldWriteContract({ contractName: "ProvingGroundsRegistry" });

  useEffect(() => {
    if (!approveCooldown) return;
    const t = setTimeout(() => setApproveCooldown(false), APPROVE_COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [approveCooldown]);

  const handleApprove = async () => {
    if (!registryAddress) return;
    setApprovalSubmitting(true);
    setApproveCooldown(true);
    try {
      await writeAndOpen(() =>
        writeClawd({
          functionName: "approve",
          args: [registryAddress, totalNeeded],
        }),
      );
      notification.success("Approval confirmed");
      await refetchAllowance();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approval failed";
      notification.error(message);
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleRegister = async () => {
    if (!contractAddress) {
      notification.error("Enter the build contract address");
      return;
    }
    if (maxClaimersBig <= 0n) {
      notification.error("maxClaimers must be greater than zero");
      return;
    }
    setRegisterSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeRegistry({
          functionName: "registerBuild",
          args: [contractAddress as `0x${string}`, bountyPerClaimerWei, maxClaimersBig],
        }),
      );
      notification.success("Build registered!");
      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      notification.error(message);
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <button className="btn btn-primary w-full" onClick={() => openConnectModal?.()} type="button">
          Connect Wallet
        </button>
      );
    }
    if (onWrongNetwork) {
      return (
        <button
          className="btn btn-warning w-full"
          onClick={() => switchChain({ chainId: targetNetwork.id })}
          type="button"
        >
          Switch to {targetNetwork.name}
        </button>
      );
    }
    if (needsApproval) {
      const disabled = approvalSubmitting || approveCooldown || totalNeeded === 0n;
      return (
        <button className="btn btn-primary w-full" onClick={handleApprove} disabled={disabled} type="button">
          {approvalSubmitting ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              Approving...
            </>
          ) : (
            <>Approve {formatEther(totalNeeded)} CLAWD</>
          )}
        </button>
      );
    }
    return (
      <button className="btn btn-primary w-full" onClick={handleRegister} disabled={registerSubmitting} type="button">
        {registerSubmitting ? (
          <>
            <span className="loading loading-spinner loading-sm" />
            Registering...
          </>
        ) : (
          "Register Build"
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col grow w-full bg-base-100">
      <div className="px-5 py-10 max-w-2xl w-full mx-auto">
        <div className="mb-6">
          <Link href="/" className="link text-sm">
            &larr; Back to feed
          </Link>
          <h1 className="text-3xl font-bold mt-2">Register a Build</h1>
          <p className="text-base-content/70 mt-2">
            Burn CLAWD to add your build to the registry. Fund the bounty pool so reviewers can claim a stamp.
          </p>
        </div>

        <div className="card bg-base-200 shadow-md">
          <div className="card-body gap-4">
            <div>
              <label className="label">
                <span className="label-text">Build Contract Address</span>
              </label>
              <AddressInput value={contractAddress} onChange={value => setContractAddress(value)} placeholder="0x..." />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  <span className="label-text">Bounty per Claimer (CLAWD)</span>
                </label>
                <input
                  className="input input-bordered w-full"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={bountyPerClaimer}
                  onChange={e => setBountyPerClaimer(e.target.value)}
                />
              </div>
              <div>
                <label className="label">
                  <span className="label-text">Max Claimers</span>
                </label>
                <input
                  className="input input-bordered w-full"
                  type="number"
                  min="1"
                  step="1"
                  value={maxClaimers}
                  onChange={e => setMaxClaimers(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-base-300 rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-base-content/70">Registration burn</span>
                <span className="font-mono">
                  {registrationBurnAmount !== undefined ? `${formatEther(registrationBurnAmount)} CLAWD` : "..."}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/70">Bounty pool</span>
                <span className="font-mono">{formatEther(bountyTotal)} CLAWD</span>
              </div>
              <div className="divider my-1" />
              <div className="flex justify-between font-bold">
                <span>Total CLAWD needed</span>
                <span className="font-mono">{formatEther(totalNeeded)} CLAWD</span>
              </div>
              {clawdBalance !== undefined && (
                <div className="flex justify-between text-xs text-base-content/60 pt-1">
                  <span>Your CLAWD balance</span>
                  <span className="font-mono">{formatEther(clawdBalance)} CLAWD</span>
                </div>
              )}
            </div>

            {renderActionButton()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
