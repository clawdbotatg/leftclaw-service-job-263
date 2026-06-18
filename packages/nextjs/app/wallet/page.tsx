"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

type StampEventArgs = {
  tokenId?: bigint;
  buildId?: bigint;
  claimer?: string;
  claimedAt?: bigint;
};

const StampRow = ({ tokenId, buildId, claimedAt }: { tokenId: bigint; buildId: bigint; claimedAt: bigint }) => {
  const date = new Date(Number(claimedAt) * 1000);

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-title">Stamp #{tokenId.toString()}</h3>
          <span className="text-xs text-base-content/60">{date.toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
          <span className="text-sm">
            For Build #{" "}
            <Link href={`/build?id=${buildId.toString()}`} className="link">
              {buildId.toString()}
            </Link>
          </span>
          <Link href={`/build?id=${buildId.toString()}`} className="btn btn-xs">
            View build
          </Link>
        </div>
      </div>
    </div>
  );
};

const WalletPage: NextPage = () => {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const { data: stampEvents, isLoading } = useScaffoldEventHistory({
    contractName: "ProvingStamp",
    eventName: "StampClaimed",
    fromBlock: 0n,
    watch: true,
  });

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address],
  });

  const myStamps = useMemo(() => {
    if (!stampEvents || !address) return [];
    const lower = address.toLowerCase();
    return (stampEvents as { args?: StampEventArgs }[])
      .filter(e => e.args?.claimer?.toLowerCase() === lower)
      .map(e => ({
        tokenId: e.args!.tokenId as bigint,
        buildId: e.args!.buildId as bigint,
        claimedAt: e.args!.claimedAt as bigint,
      }))
      .sort((a, b) => (a.claimedAt > b.claimedAt ? -1 : a.claimedAt < b.claimedAt ? 1 : 0));
  }, [stampEvents, address]);

  return (
    <div className="flex flex-col grow w-full bg-base-100">
      <div className="px-5 py-10 max-w-3xl w-full mx-auto">
        <div className="mb-6">
          <Link href="/" className="link text-sm">
            &larr; Back to feed
          </Link>
          <h1 className="text-3xl font-bold mt-2">My Stamps</h1>
          <p className="text-base-content/70 mt-2">Soulbound proofs of every build you&apos;ve reviewed.</p>
        </div>

        {!isConnected ? (
          <div className="card bg-base-200">
            <div className="card-body items-center text-center">
              <p>Connect your wallet to see your stamps.</p>
              <button className="btn btn-primary" onClick={() => openConnectModal?.()} type="button">
                Connect Wallet
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="card bg-base-200 shadow-sm mb-6">
              <div className="card-body">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-base-content/60">Connected</div>
                    <Address address={address} />
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-base-content/60">CLAWD Balance</div>
                    <div className="font-mono">
                      {clawdBalance !== undefined ? `${formatEther(clawdBalance)} CLAWD` : "..."}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="divider">Stamps</div>

            {isLoading && myStamps.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <span className="loading loading-spinner loading-lg" />
              </div>
            ) : myStamps.length === 0 ? (
              <div className="text-center py-12 text-base-content/60">
                You haven&apos;t claimed any stamps yet.{" "}
                <Link href="/" className="link">
                  Browse builds
                </Link>{" "}
                to get started.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {myStamps.map(s => (
                  <StampRow
                    key={s.tokenId.toString()}
                    tokenId={s.tokenId}
                    buildId={s.buildId}
                    claimedAt={s.claimedAt}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WalletPage;
