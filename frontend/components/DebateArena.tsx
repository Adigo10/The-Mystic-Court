"use client";

import * as React from "react";

import AgentCard from "@/components/AgentCard";
import CrystalBallLoader from "@/components/CrystalBallLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentKey, DebateMessage, PalmReading } from "@/lib/types";

const API_BASE = "http://localhost:8000";

const AGENTS: Record<AgentKey, { name: string; emoji: string; mood: string }> = {
  ancient_oracle: { name: "The Ancient Oracle", emoji: "𓂀", mood: "cosmic riddles" },
  rage_gremlin: { name: "The Rage Gremlin", emoji: "!!", mood: "flaw frenzy" },
  hype_prophet: { name: "The Hype Prophet", emoji: "^", mood: "supernova belief" },
  skeptic_scholar: { name: "The Skeptic Scholar", emoji: "?", mood: "receipts ready" },
  chaos_neutral: { name: "The Chaos Neutral", emoji: "~", mood: "unstable balance" }
};

type DebateState = Record<string, DebateMessage>;

export default function DebateArena({
  idea,
  palmContext,
  onComplete
}: {
  idea: string;
  palmContext: PalmReading;
  onComplete: (transcript: string) => void;
}) {
  const [messages, setMessages] = React.useState<DebateState>({});
  const [status, setStatus] = React.useState<"connecting" | "streaming" | "complete" | "error">("connecting");
  const messagesRef = React.useRef<DebateState>({});

  React.useEffect(() => {
    setMessages({});
    messagesRef.current = {};
    setStatus("connecting");

    const params = new URLSearchParams({
      idea,
      palm_context: JSON.stringify(palmContext)
    });
    const source = new EventSource(`${API_BASE}/api/debate/stream?${params.toString()}`);

    source.onopen = () => setStatus("streaming");
    source.onerror = () => {
      setStatus("error");
      source.close();
    };
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as (Partial<DebateMessage> & { type?: string });
      if (payload.type === "complete") {
        setStatus("complete");
        source.close();
        onComplete(buildTranscript(messagesRef.current));
        return;
      }

      if (!payload.agent || !payload.round) {
        return;
      }

      const key = `${payload.round}-${payload.agent}`;
      const contentDelta = payload.content || "";
      const nextMessage: DebateMessage = {
        agent: payload.agent,
        round: payload.round,
        content: `${messagesRef.current[key]?.content || ""}${contentDelta}`,
        done: Boolean(payload.done)
      };
      const nextState = { ...messagesRef.current, [key]: nextMessage };
      messagesRef.current = nextState;
      setMessages(nextState);
    };

    return () => source.close();
  }, [idea, palmContext, onComplete]);

  const rows = [1, 2].flatMap((round) =>
    (Object.keys(AGENTS) as AgentKey[]).map((agentKey) => {
      const key = `${round}-${agentKey}`;
      return messages[key] || { agent: agentKey, round, content: "", done: false };
    })
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3: Debate Arena</CardTitle>
        <p className="text-sm text-muted-foreground">
          {status === "complete" ? "The arguments are sealed." : "The five agents are arguing in parallel."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {status === "connecting" ? <CrystalBallLoader label="Opening the court channel" /> : null}
        {status === "error" ? (
          <p className="rounded-md border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-100">
            The debate stream closed unexpectedly. Check the FastAPI server and API keys.
          </p>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((message) => {
            const agent = AGENTS[message.agent];
            return (
              <AgentCard
                key={`${message.round}-${message.agent}`}
                agentKey={message.agent}
                agentName={agent.name}
                emoji={agent.emoji}
                round={message.round}
                content={message.content || "Awaiting the first omen..."}
                done={message.done}
                mood={message.round === 2 ? `intensified ${agent.mood}` : agent.mood}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function buildTranscript(messages: DebateState) {
  return Object.values(messages)
    .sort((a, b) => a.round - b.round || a.agent.localeCompare(b.agent))
    .map((message) => `${AGENTS[message.agent].name} Round ${message.round}:\n${message.content}`)
    .join("\n\n");
}
