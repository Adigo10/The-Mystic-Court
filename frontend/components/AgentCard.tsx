"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AgentCardProps = {
  agentKey: string;
  agentName: string;
  emoji: string;
  round: number;
  content: string;
  done: boolean;
  mood: string;
};

export default function AgentCard({
  agentKey,
  agentName,
  emoji,
  round,
  content,
  done,
  mood
}: AgentCardProps) {
  const [visible, setVisible] = React.useState("");

  React.useEffect(() => {
    if (visible.length >= content.length) {
      return;
    }
    const timer = window.setInterval(() => {
      setVisible((current) => content.slice(0, Math.min(content.length, current.length + 4)));
    }, 18);
    return () => window.clearInterval(timer);
  }, [content, visible.length]);

  React.useEffect(() => {
    if (content.length < visible.length) {
      setVisible(content);
    }
  }, [content, visible.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      data-agent={agentKey}
    >
      <Card
        className={cn(
          "h-full overflow-hidden",
          round === 2 ? "border-primary/70 bg-accent/40 shadow-glow" : "border-border"
        )}
      >
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="text-2xl">{emoji}</span>
                {agentName}
              </CardTitle>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Round {round} | {mood}
              </p>
            </div>
            <span
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
                done ? "border-primary/50 text-primary" : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {done ? "done" : "speaking"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="min-h-[120px] whitespace-pre-wrap text-sm leading-6 text-foreground/90">
            {visible}
            {!done ? <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-primary align-middle" /> : null}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
