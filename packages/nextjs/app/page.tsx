"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

type FeedbackEvent = {
  args?: {
    feedbackId?: bigint;
    buildId?: bigint;
    reviewer?: string;
    rating?: number;
  };
};

const BuildCard = ({ buildId, feedbackEvents }: { buildId: bigint; feedbackEvents: FeedbackEvent[] }) => {
  const { data: build } = useScaffoldReadContract({
    contractName: "ProvingGroundsRegistry",
    functionName: "getBuild",
    args: [buildId],
  });

  const ratings = useMemo(() => {
    const matching = feedbackEvents.filter(e => e.args?.buildId === buildId);
    if (matching.length === 0) return { avg: 0, count: 0 };
    const total = matching.reduce((acc, e) => acc + Number(e.args?.rating ?? 0), 0);
    return { avg: total / matching.length, count: matching.length };
  }, [feedbackEvents, buildId]);

  if (!build) {
    return (
      <div className="card bg-base-200 shadow-md">
        <div className="card-body">
          <span className="loading loading-spinner loading-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-md">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">Build #{buildId.toString()}</h2>
          <div className={`badge ${build.active ? "badge-success" : "badge-error"}`}>
            {build.active ? "Active" : "Inactive"}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div>
            <div className="text-xs text-base-content/60">Contract</div>
            <Address address={build.contractAddress} size="sm" />
          </div>
          <div>
            <div className="text-xs text-base-content/60">Builder</div>
            <Address address={build.builder} size="sm" />
          </div>
          <div>
            <div className="text-xs text-base-content/60">Bounty Remaining</div>
            <div className="font-mono text-sm">{formatEther(build.bountyPool)} CLAWD</div>
          </div>
          <div>
            <div className="text-xs text-base-content/60">Claimers</div>
            <div className="font-mono text-sm">
              {build.claimerCount.toString()} / {build.maxClaimers.toString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-base-content/60">Bounty / Claimer</div>
            <div className="font-mono text-sm">{formatEther(build.bountyPerClaimer)} CLAWD</div>
          </div>
          <div>
            <div className="text-xs text-base-content/60">Rating</div>
            <div className="font-mono text-sm">
              {ratings.count === 0 ? "No ratings yet" : `${ratings.avg.toFixed(2)} (${ratings.count})`}
            </div>
          </div>
        </div>

        <div className="card-actions justify-end mt-3">
          <Link href={`/build?id=${buildId.toString()}`} className="btn btn-primary btn-sm">
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
};

const Home: NextPage = () => {
  const { isConnected } = useAccount();

  const { data: registeredEvents, isLoading: isLoadingBuilds } = useScaffoldEventHistory({
    contractName: "ProvingGroundsRegistry",
    eventName: "BuildRegistered",
    fromBlock: 0n,
    watch: true,
  });

  const { data: feedbackEvents } = useScaffoldEventHistory({
    contractName: "ProvingFeedback",
    eventName: "FeedbackSubmitted",
    fromBlock: 0n,
    watch: true,
  });

  const buildIds = useMemo(() => {
    if (!registeredEvents) return [];
    const ids = registeredEvents.map(e => e.args?.buildId).filter((id): id is bigint => typeof id === "bigint");
    // Unique + sort descending (newest first)
    const unique = Array.from(new Set(ids.map(id => id.toString()))).map(s => BigInt(s));
    unique.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    return unique;
  }, [registeredEvents]);

  return (
    <div className="flex flex-col grow w-full bg-base-100">
      <div className="px-5 py-10 max-w-5xl w-full mx-auto">
        <div className="flex flex-col items-center text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">The Proving Grounds</h1>
          <p className="text-base-content/70 max-w-2xl">
            A permissioned-by-burn onchain registry for LeftClaw-verified builds on Base. Burn CLAWD to register,
            collect stamps, and review the builds you trust.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Link href="/register" className="btn btn-primary">
              Register Your Build
            </Link>
            {!isConnected && <RainbowKitCustomConnectButton />}
          </div>
        </div>

        <div className="divider">Registered Builds</div>

        {isLoadingBuilds && buildIds.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : buildIds.length === 0 ? (
          <div className="text-center py-16 text-base-content/60">No builds registered yet. Be the first.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {buildIds.map(id => (
              <BuildCard key={id.toString()} buildId={id} feedbackEvents={(feedbackEvents as FeedbackEvent[]) || []} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
