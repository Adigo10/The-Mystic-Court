"use client";

import { motion } from "framer-motion";

import { AGENT_META } from "@/components/CouncilChamber";
import type { AgentKey, DebatePhase, Vote } from "@/lib/types";
import { cn } from "@/lib/utils";

type AgentPortraitProps = {
  agentKey: AgentKey;
  isActive: boolean;
  phase: DebatePhase;
  vote?: Vote;
};

export default function AgentPortrait({ agentKey, isActive, phase, vote }: AgentPortraitProps) {
  const agent = AGENT_META[agentKey];
  const votePercent = Math.round((vote?.confidence || 0) * 100);
  const showVote = Boolean(vote);
  const status = getStatusLabel({ isActive, phase, vote });
  const activeOpacity = phase === "voting" ? 1 : isActive ? 1 : 0.4;

  return (
    <motion.div
      className="relative flex w-28 shrink-0 flex-col items-center text-center"
      initial={false}
      animate={{ scale: isActive ? 1.15 : 1, opacity: activeOpacity }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      data-agent={agentKey}
    >
      {showVote ? (
        <motion.div
          className="absolute -top-12 z-20 w-24 rounded-md border border-primary/50 bg-card px-2 py-1 shadow-md"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            {vote?.verdict}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${votePercent}%` }}
              transition={{ duration: 0.35 }}
            />
          </div>
        </motion.div>
      ) : null}

      <div className="relative grid h-20 w-20 place-items-center">
        {isActive ? (
          <motion.div
            className="absolute inset-[-12px] rounded-full bg-primary/20 blur-xl"
            animate={{ opacity: [0.45, 1, 0.45], scale: [0.9, 1.16, 0.9] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
        <div
          className={cn(
            "relative grid h-20 w-20 place-items-center rounded-full border bg-card text-3xl font-black text-primary shadow-glow",
            isActive ? "border-primary/90" : "border-border"
          )}
        >
          <span aria-hidden="true">{agent.emoji}</span>
        </div>
      </div>
      <div className="mt-3 min-h-10 text-sm font-semibold leading-tight text-foreground">
        {agent.name}
      </div>
      <div
        className={cn(
          "mt-2 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
          isActive || phase === "voting" || vote
            ? "border-primary/50 text-primary"
            : "border-muted-foreground/25 text-muted-foreground"
        )}
      >
        {status}
      </div>
    </motion.div>
  );
}

function getStatusLabel({
  isActive,
  phase,
  vote
}: {
  isActive: boolean;
  phase: DebatePhase;
  vote?: Vote;
}) {
  if (vote) {
    return `voted ${vote.verdict}`;
  }
  if (phase === "voting") {
    return "voting";
  }
  if (isActive) {
    return "speaking";
  }
  return "silent";
}
