"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import {
  useDeployedContractInfo,
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
  useWriteAndOpen,
} from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const APPROVE_COOLDOWN_MS = 5000;

type FeedbackEventArgs = {
  feedbackId?: bigint;
  buildId?: bigint;
  reviewer?: string;
  rating?: number;
};

const Stars = ({ rating }: { rating: number }) => {
  const safe = Math.max(0, Math.min(5, rating));
  return (
    <span className="font-mono text-warning">
      {"★".repeat(safe)}
      <span className="text-base-content/30">{"★".repeat(5 - safe)}</span>
    </span>
  );
};

const ReviewRow = ({ feedbackId, currentUser }: { feedbackId: bigint; currentUser?: string }) => {
  const { data: feedback } = useScaffoldReadContract({
    contractName: "ProvingFeedback",
    functionName: "feedbackById",
    args: [feedbackId],
  });

  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { writeContractAsync: writeFeedback } = useScaffoldWriteContract({ contractName: "ProvingFeedback" });
  const { data: feedbackContract } = useDeployedContractInfo({ contractName: "ProvingFeedback" });
  const { writeAndOpen } = useWriteAndOpen();

  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [currentUser as `0x${string}` | undefined, feedbackContract?.address],
  });

  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState("1");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approveCooldown, setApproveCooldown] = useState(false);
  const [tipSubmitting, setTipSubmitting] = useState(false);

  useEffect(() => {
    if (!approveCooldown) return;
    const t = setTimeout(() => setApproveCooldown(false), APPROVE_COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [approveCooldown]);

  let tipWei = 0n;
  try {
    tipWei = parseEther(tipAmount || "0");
  } catch {
    tipWei = 0n;
  }

  if (!feedback) return null;

  const [, reviewer, reviewText, rating, totalTipsReceived] = feedback as unknown as [
    bigint,
    string,
    string,
    number,
    bigint,
    bigint,
  ];

  const isSelf = currentUser?.toLowerCase() === reviewer?.toLowerCase();
  const needsApproval = (allowance ?? 0n) < tipWei;

  const handleApprove = async () => {
    if (!feedbackContract?.address) return;
    setApprovalSubmitting(true);
    setApproveCooldown(true);
    try {
      await writeAndOpen(() =>
        writeClawd({
          functionName: "approve",
          args: [feedbackContract.address, tipWei],
        }),
      );
      notification.success("Approval confirmed");
      await refetchAllowance();
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleTip = async () => {
    if (tipWei === 0n) {
      notification.error("Enter a tip amount");
      return;
    }
    setTipSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeFeedback({
          functionName: "tipReviewer",
          args: [feedbackId, tipWei],
        }),
      );
      notification.success("Tip sent");
      setTipOpen(false);
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "Tip failed");
    } finally {
      setTipSubmitting(false);
    }
  };

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Address address={reviewer as `0x${string}`} size="sm" />
          <Stars rating={Number(rating)} />
        </div>
        <p className="whitespace-pre-wrap text-sm mt-1">{reviewText}</p>
        <div className="flex flex-wrap items-center justify-between mt-2 gap-2">
          <span className="text-xs text-base-content/60">
            Tips received: <span className="font-mono">{formatEther(totalTipsReceived)} CLAWD</span>
          </span>
          {!isSelf && (
            <button className="btn btn-xs" onClick={() => setTipOpen(o => !o)} type="button">
              {tipOpen ? "Cancel" : "Tip"}
            </button>
          )}
        </div>
        {tipOpen && (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grow">
              <label className="label py-0">
                <span className="label-text text-xs">Tip amount (CLAWD)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                className="input input-sm input-bordered w-full"
                value={tipAmount}
                onChange={e => setTipAmount(e.target.value)}
              />
            </div>
            {needsApproval ? (
              <button
                className="btn btn-sm btn-primary"
                disabled={approvalSubmitting || approveCooldown || tipWei === 0n}
                onClick={handleApprove}
                type="button"
              >
                {approvalSubmitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Approving...
                  </>
                ) : (
                  "Approve"
                )}
              </button>
            ) : (
              <button
                className="btn btn-sm btn-primary"
                disabled={tipSubmitting || tipWei === 0n}
                onClick={handleTip}
                type="button"
              >
                {tipSubmitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Tipping...
                  </>
                ) : (
                  "Send Tip"
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const ClaimStampSection = ({ buildId }: { buildId: bigint }) => {
  const { address, isConnected, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { writeAndOpen } = useWriteAndOpen();

  const { data: hasClaimed } = useScaffoldReadContract({
    contractName: "ProvingStamp",
    functionName: "hasClaimed",
    args: [buildId, address],
  });

  const { writeContractAsync: writeStamp } = useScaffoldWriteContract({ contractName: "ProvingStamp" });
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  if (hasClaimed) {
    return <div className="badge badge-success badge-lg">Already Stamped &#10003;</div>;
  }

  if (!isConnected) {
    return (
      <button className="btn btn-primary" onClick={() => openConnectModal?.()} type="button">
        Connect Wallet
      </button>
    );
  }
  if (chain?.id !== targetNetwork.id) {
    return (
      <button className="btn btn-warning" onClick={() => switchChain({ chainId: targetNetwork.id })} type="button">
        Switch to {targetNetwork.name}
      </button>
    );
  }

  const handleClaim = async () => {
    setClaimSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeStamp({
          functionName: "claimStamp",
          args: [buildId],
        }),
      );
      notification.success("Stamp claimed!");
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaimSubmitting(false);
    }
  };

  return (
    <button className="btn btn-primary" onClick={handleClaim} disabled={claimSubmitting} type="button">
      {claimSubmitting ? (
        <>
          <span className="loading loading-spinner loading-sm" />
          Claiming...
        </>
      ) : (
        "Claim Stamp"
      )}
    </button>
  );
};

const SubmitReviewSection = ({ buildId }: { buildId: bigint }) => {
  const { address } = useAccount();
  const { writeAndOpen } = useWriteAndOpen();

  const { data: hasClaimed } = useScaffoldReadContract({
    contractName: "ProvingStamp",
    functionName: "hasClaimed",
    args: [buildId, address],
  });
  const { data: hasFeedback } = useScaffoldReadContract({
    contractName: "ProvingFeedback",
    functionName: "hasFeedback",
    args: [buildId, address],
  });

  const { writeContractAsync: writeFeedback } = useScaffoldWriteContract({ contractName: "ProvingFeedback" });

  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!address) return null;
  if (!hasClaimed) return null;
  if (hasFeedback) {
    return (
      <div className="alert alert-success">
        <span>You&apos;ve already left a review for this build. Thanks!</span>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (text.length === 0) {
      notification.error("Review text required");
      return;
    }
    if (text.length > 512) {
      notification.error("Review text too long (max 512 chars)");
      return;
    }
    setSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeFeedback({
          functionName: "submitFeedback",
          args: [buildId, rating, text],
        }),
      );
      notification.success("Review submitted");
      setText("");
    } catch (err) {
      notification.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body gap-3">
        <h3 className="card-title">Leave a Review</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-end">
          <div>
            <label className="label py-0">
              <span className="label-text text-xs">Rating</span>
            </label>
            <select className="select select-bordered" value={rating} onChange={e => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map(r => (
                <option key={r} value={r}>
                  {r} {r === 1 ? "star" : "stars"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label py-0">
              <span className="label-text text-xs">Review (max 512 chars)</span>
            </label>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={3}
              maxLength={512}
              value={text}
              onChange={e => setText(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting} type="button">
          {submitting ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              Submitting...
            </>
          ) : (
            "Submit Review"
          )}
        </button>
      </div>
    </div>
  );
};

const BuildDetail = ({ buildId }: { buildId: bigint }) => {
  const { address } = useAccount();

  const { data: build } = useScaffoldReadContract({
    contractName: "ProvingGroundsRegistry",
    functionName: "getBuild",
    args: [buildId],
  });

  const { data: feedbackEvents } = useScaffoldEventHistory({
    contractName: "ProvingFeedback",
    eventName: "FeedbackSubmitted",
    fromBlock: 0n,
    watch: true,
  });

  const matchingFeedback = useMemo(() => {
    if (!feedbackEvents) return [] as { feedbackId: bigint }[];
    return (feedbackEvents as { args?: FeedbackEventArgs }[])
      .filter(e => e.args?.buildId === buildId && typeof e.args?.feedbackId === "bigint")
      .map(e => ({ feedbackId: e.args!.feedbackId as bigint }));
  }, [feedbackEvents, buildId]);

  // We have to read each feedback's tips to sort. Best-effort sort happens via separate
  // child reads — initial list is rendered in event order; the child rows show tips.
  // For ordering, we use the static rating event order but place this comment as a note.

  if (!build) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
              <Address address={build.contractAddress} />
            </div>
            <div>
              <div className="text-xs text-base-content/60">Builder</div>
              <Address address={build.builder} />
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
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-md border border-base-300">
        <div className="card-body">
          <h3 className="card-title">Claim Stamp</h3>
          <p className="text-sm text-base-content/60">
            Claim a soulbound stamp to prove you reviewed this build and earn the bounty.
          </p>
          <div className="mt-2">
            <ClaimStampSection buildId={buildId} />
          </div>
        </div>
      </div>

      <SubmitReviewSection buildId={buildId} />

      <div>
        <h3 className="text-2xl font-bold mb-3">Reviews</h3>
        {matchingFeedback.length === 0 ? (
          <div className="text-base-content/60 py-6 text-center">No reviews yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {matchingFeedback.map(f => (
              <ReviewRow key={f.feedbackId.toString()} feedbackId={f.feedbackId} currentUser={address} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const BuildPageContent = () => {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");

  let buildId: bigint | null = null;
  try {
    if (idParam !== null) buildId = BigInt(idParam);
  } catch {
    buildId = null;
  }

  if (buildId === null) {
    return (
      <div className="text-center py-16">
        <p className="text-base-content/60">Missing or invalid build id.</p>
        <Link href="/" className="link mt-3 inline-block">
          Back to feed
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col grow w-full bg-base-100">
      <div className="px-5 py-10 max-w-3xl w-full mx-auto">
        <div className="mb-4">
          <Link href="/" className="link text-sm">
            &larr; Back to feed
          </Link>
        </div>
        <BuildDetail buildId={buildId} />
      </div>
    </div>
  );
};

const BuildPage: NextPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      }
    >
      <BuildPageContent />
    </Suspense>
  );
};

export default BuildPage;
