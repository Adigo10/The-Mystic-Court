"use client";

import { motion } from "framer-motion";

import type { CouncilVerdict, VoteTally } from "@/lib/types";
import { cn } from "@/lib/utils";

const VERDICTS: CouncilVerdict[] = ["GO", "NO_GO", "PIVOT"];
const LABELS: Record<CouncilVerdict, string> = {
  GO: "GO",
  NO_GO: "NO-GO",
  PIVOT: "PIVOT"
};

type ConsensusMeterProps = {
  tally: VoteTally;
  leader: CouncilVerdict | null;
  round: number;
};

export default function ConsensusMeter({ tally, leader, round }: ConsensusMeterProps) {
  const total = Math.max(
    1,
    VERDICTS.reduce((sum, verdict) => sum + (tally[verdict] || 0), 0)
  );

  return (
    <div className="rounded-md border border-border bg-card/80 p-4 shadow-glow backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-foreground">Consensus Meter</h2>
        <span className="rounded-md border border-primary/40 px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Round {round || 0}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {VERDICTS.map((verdict) => {
          const count = tally[verdict] || 0;
          const percent = Math.round((count / total) * 100);
          const isLeader = leader === verdict;

          return (
            <div key={verdict} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em]">
                <span className={cn(isLeader ? "text-primary" : "text-muted-foreground")}>
                  {LABELS[verdict]}
                </span>
                <span className="text-foreground/80">{count}/5</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full border border-border bg-background/80">
                <motion.div
                  className={cn(
                    "h-full rounded-full bg-gradient-to-r from-primary/65 via-primary to-ring",
                    isLeader && "shadow-[0_0_22px_hsl(var(--primary)/0.72)]"
                  )}
                  initial={false}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
