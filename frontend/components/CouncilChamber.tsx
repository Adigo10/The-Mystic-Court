"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

import AgentPortrait from "@/components/AgentPortrait";
import ConsensusMeter from "@/components/ConsensusMeter";
import CrystalBallLoader from "@/components/CrystalBallLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AgentKey,
  CouncilEvent,
  CouncilMessage,
  CouncilVerdict,
  DebatePhase,
  PalmReading,
  Vote,
  VoteTally
} from "@/lib/types";
import { cn } from "@/lib/utils";

const API_BASE = "http://localhost:8000";

export const AGENT_META: Record<AgentKey, { name: string; emoji: string; mood: string }> = {
  ancient_oracle: { name: "The Ancient Oracle", emoji: "𓂀", mood: "cosmic riddles" },
  rage_gremlin: { name: "The Rage Gremlin", emoji: "!!", mood: "flaw frenzy" },
  hype_prophet: { name: "The Hype Prophet", emoji: "^", mood: "supernova belief" },
  skeptic_scholar: { name: "The Skeptic Scholar", emoji: "?", mood: "receipts ready" },
  chaos_neutral: { name: "The Chaos Neutral", emoji: "~", mood: "unstable balance" }
};

const AGENT_ORDER = Object.keys(AGENT_META) as AgentKey[];
const EMPTY_TALLY: VoteTally = { GO: 0, NO_GO: 0, PIVOT: 0 };
const PORTRAIT_POSITIONS: Record<AgentKey, { x: number; y: number }> = {
  ancient_oracle: { x: 0, y: -200 },
  rage_gremlin: { x: 228, y: -62 },
  hype_prophet: { x: 141, y: 162 },
  skeptic_scholar: { x: -141, y: 162 },
  chaos_neutral: { x: -228, y: -62 }
};

type CouncilState = {
  phase: DebatePhase;
  turn: number;
  currentSpeaker: AgentKey | null;
  currentHint: string;
  transcript: CouncilMessage[];
  streamingByTurn: Record<number, string>;
  votesByRound: Vote[][];
  liveVotes: Partial<Record<AgentKey, Vote>>;
  tally: VoteTally;
  leader: CouncilVerdict | null;
  finalVerdict: string;
  consensusVerdict: CouncilVerdict | null;
  voteRound: number;
  reachedConsensusFlash: boolean;
  errorMessage: string;
};

const INITIAL_STATE: CouncilState = {
  phase: "connecting",
  turn: 0,
  currentSpeaker: null,
  currentHint: "",
  transcript: [],
  streamingByTurn: {},
  votesByRound: [],
  liveVotes: {},
  tally: EMPTY_TALLY,
  leader: null,
  finalVerdict: "",
  consensusVerdict: null,
  voteRound: 0,
  reachedConsensusFlash: false,
  errorMessage: ""
};

async function playAgentAudio(agent: AgentKey, text: string): Promise<void> {
  try {
    const params = new URLSearchParams({ text, agent });
    const response = await fetch(`${API_BASE}/api/tts?${params.toString()}`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    // Silently fall back if TTS is unavailable or autoplay is blocked
  }
}

export default function CouncilChamber({
  idea,
  palmContext,
  onComplete
}: {
  idea: string;
  palmContext: PalmReading;
  onComplete: (transcript: string) => void;
}) {
  const [state, setState] = React.useState<CouncilState>(INITIAL_STATE);
  const stateRef = React.useRef<CouncilState>(INITIAL_STATE);
  const transcriptRef = React.useRef<HTMLDivElement | null>(null);
  const seenTurnsRef = React.useRef<Set<string>>(new Set());

  const updateState = React.useCallback((updater: (current: CouncilState) => CouncilState) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  React.useEffect(() => {
    seenTurnsRef.current = new Set();
    stateRef.current = INITIAL_STATE;
    setState(INITIAL_STATE);

    const params = new URLSearchParams({
      idea,
      palm_context: JSON.stringify(palmContext)
    });
    const source = new EventSource(`${API_BASE}/api/debate/council?${params.toString()}`);
    let closed = false;

    const closeSource = () => {
      if (!closed) {
        closed = true;
        source.close();
      }
    };

    source.onopen = () => {
      updateState((current) => ({ ...current, errorMessage: "" }));
    };

    source.onerror = () => {
      updateState((current) => ({
        ...current,
        phase: "error",
        errorMessage: "The council stream closed unexpectedly. Check the FastAPI server and API keys."
      }));
      closeSource();
    };

    source.onmessage = (event) => {
      let payload: CouncilEvent;
      try {
        payload = JSON.parse(event.data) as CouncilEvent;
      } catch {
        updateState((current) => ({
          ...current,
          phase: "error",
          errorMessage: "The council sent an unreadable event."
        }));
        closeSource();
        return;
      }

      dispatchCouncilEvent(payload, updateState, closeSource, onComplete);
    };

    return () => closeSource();
  }, [idea, palmContext, onComplete, updateState]);

  React.useEffect(() => {
    const element = transcriptRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [state.transcript, state.streamingByTurn, state.finalVerdict]);

  React.useEffect(() => {
    for (const message of state.transcript) {
      const key = `${message.agent}-${message.turn}`;
      if (!seenTurnsRef.current.has(key)) {
        seenTurnsRef.current.add(key);
        void playAgentAudio(message.agent, message.text);
      }
    }
  }, [state.transcript]);

  const liveTurnText =
    state.currentSpeaker !== null ? state.streamingByTurn[state.turn] || "" : "";

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow duration-700",
        state.reachedConsensusFlash && "shadow-[0_0_54px_hsl(42_94%_58%/0.72)]"
      )}
    >
      <CardHeader>
        <CardTitle>Step 3: Council Chamber</CardTitle>
        <p className="text-sm text-muted-foreground">
          {state.phase === "complete"
            ? "The council has sealed its verdict."
            : "The agents are taking turns until a supermajority forms."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <ConsensusMeter tally={state.tally} leader={state.leader} round={state.voteRound} />

        {state.phase === "connecting" ? <CrystalBallLoader label="Opening the council channel" /> : null}
        {state.phase === "error" ? (
          <p className="rounded-md border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-100">
            {state.errorMessage || "The council stream closed unexpectedly. Check the FastAPI server and API keys."}
          </p>
        ) : null}

        <div className="md:hidden">
          <div className="flex gap-5 overflow-x-auto px-2 pb-4 pt-10">
            {AGENT_ORDER.map((agentKey) => (
              <AgentPortrait
                key={agentKey}
                agentKey={agentKey}
                isActive={state.currentSpeaker === agentKey}
                phase={state.phase}
                vote={state.liveVotes[agentKey]}
              />
            ))}
          </div>
        </div>

        <div
          className={cn(
            "relative mx-auto hidden h-[480px] max-w-[620px] rounded-md border border-border bg-background/45 backdrop-blur md:block",
            state.phase === "consensus" && "border-primary/70"
          )}
        >
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-primary/20 bg-primary/5" />

          <CenterSpotlight
            phase={state.phase}
            speaker={state.currentSpeaker}
            hint={state.currentHint}
            consensusVerdict={state.consensusVerdict}
            voteRound={state.voteRound}
          />

          {AGENT_ORDER.map((agentKey) => {
            const position = PORTRAIT_POSITIONS[agentKey];
            return (
              <div
                key={agentKey}
                className="absolute left-1/2 top-1/2 z-20"
                style={{
                  transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`
                }}
              >
                <AgentPortrait
                  agentKey={agentKey}
                  isActive={state.currentSpeaker === agentKey}
                  phase={state.phase}
                  vote={state.liveVotes[agentKey]}
                />
              </div>
            );
          })}
        </div>

        <div
          className={cn(
            "flex h-[420px] flex-col rounded-md border border-border bg-card/85 shadow-glow transition-opacity",
            state.phase === "voting" && "opacity-60"
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="font-serif text-lg font-bold text-foreground">Shared Transcript</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Turn {state.turn}
              </div>
            </div>
            {state.currentSpeaker && state.phase === "speaking" ? (
              <div className="text-right text-xs uppercase tracking-[0.18em] text-primary">
                {AGENT_META[state.currentSpeaker].name} speaking
              </div>
            ) : null}
          </div>
          <div ref={transcriptRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <AnimatePresence initial={false}>
              {state.transcript.map((message) => (
                <TranscriptBubble
                  key={`${message.turn}-${message.agent}`}
                  message={message}
                  text={message.text}
                  done
                />
              ))}
              {state.currentSpeaker && liveTurnText ? (
                <TranscriptBubble
                  key={`streaming-${state.turn}-${state.currentSpeaker}`}
                  message={{
                    agent: state.currentSpeaker,
                    turn: state.turn,
                    text: liveTurnText
                  }}
                  text={liveTurnText}
                  done={state.phase !== "speaking"}
                />
              ) : null}
              {state.finalVerdict ? (
                <motion.div
                  key="final-verdict-stream"
                  className="rounded-md border border-primary/50 bg-primary/10 p-3 text-sm leading-6 text-foreground"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                    Final Verdict
                  </div>
                  <RevealText text={state.finalVerdict} done={state.phase === "complete"} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <div className="grid gap-3 rounded-md border border-border bg-card/70 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Turn {state.turn}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {state.currentHint || "The moderator is reading the room."}
          </p>
          <AnimatePresence>
            {state.phase === "complete" ? (
              <motion.div
                className="rounded-md border border-primary/50 px-3 py-2 text-sm font-semibold text-primary"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {state.consensusVerdict ? `Consensus: ${state.consensusVerdict}` : "Verdict complete"}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

function dispatchCouncilEvent(
  payload: CouncilEvent,
  updateState: (updater: (current: CouncilState) => CouncilState) => void,
  closeSource: () => void,
  onComplete: (transcript: string) => void
) {
  switch (payload.type) {
    case "moderator":
      updateState((current) => ({
        ...current,
        phase: "speaking",
        currentSpeaker: payload.speaker,
        currentHint: payload.hint,
        turn: payload.turn,
        errorMessage: ""
      }));
      break;
    case "turn_start":
      updateState((current) => ({
        ...current,
        phase: "speaking",
        currentSpeaker: payload.agent,
        turn: payload.turn,
        streamingByTurn: { ...current.streamingByTurn, [payload.turn]: "" }
      }));
      break;
    case "delta":
      updateState((current) => ({
        ...current,
        phase: "speaking",
        currentSpeaker: payload.agent,
        turn: payload.turn,
        streamingByTurn: {
          ...current.streamingByTurn,
          [payload.turn]: `${current.streamingByTurn[payload.turn] || ""}${payload.content || ""}`
        }
      }));
      break;
    case "turn_end":
      updateState((current) => {
        const text = current.streamingByTurn[payload.turn] || "";
        const streamingByTurn = { ...current.streamingByTurn };
        delete streamingByTurn[payload.turn];
        return {
          ...current,
          currentSpeaker: null,
          transcript: [...current.transcript, { agent: payload.agent, turn: payload.turn, text }],
          streamingByTurn
        };
      });
      break;
    case "vote_open":
      updateState((current) => ({
        ...current,
        phase: "voting",
        voteRound: payload.round,
        liveVotes: {},
        currentSpeaker: null
      }));
      break;
    case "vote_cast":
      updateState((current) => ({
        ...current,
        phase: current.phase === "voting" ? current.phase : "voting",
        voteRound: payload.round,
        liveVotes: {
          ...current.liveVotes,
          [payload.agent]: {
            agent: payload.agent,
            verdict: payload.verdict,
            confidence: payload.confidence,
            reason: payload.reason,
            round: payload.round
          }
        }
      }));
      break;
    case "vote_result":
      updateState((current) => ({
        ...current,
        votesByRound: [...current.votesByRound, Object.values(current.liveVotes) as Vote[]],
        tally: payload.tally,
        leader: payload.leader,
        voteRound: payload.round,
        reachedConsensusFlash: payload.reached_consensus
      }));
      if (payload.reached_consensus) {
        window.setTimeout(() => {
          updateState((current) => ({ ...current, reachedConsensusFlash: false }));
        }, 1000);
      }
      break;
    case "consensus":
      updateState((current) => ({
        ...current,
        phase: "consensus",
        consensusVerdict: payload.verdict,
        voteRound: payload.round
      }));
      break;
    case "final_delta":
      updateState((current) => ({
        ...current,
        finalVerdict: `${current.finalVerdict}${payload.content || ""}`
      }));
      break;
    case "complete":
      updateState((current) => {
        const finalVerdict = payload.final_verdict || current.finalVerdict;
        const next = {
          ...current,
          phase: "complete" as DebatePhase,
          finalVerdict
        };
        window.setTimeout(() => onComplete(buildTranscript(next.transcript)), 0);
        return next;
      });
      closeSource();
      break;
    case "error":
      updateState((current) => ({
        ...current,
        phase: "error",
        errorMessage: payload.message || "The council stream failed."
      }));
      closeSource();
      break;
    default:
      break;
  }
}

function TranscriptBubble({
  message,
  text,
  done
}: {
  message: CouncilMessage;
  text: string;
  done: boolean;
}) {
  const agent = AGENT_META[message.agent];

  return (
    <motion.div
      className="rounded-md border border-border bg-background/70 p-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28 }}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em]">
        <span className="font-bold text-primary">{agent.name}</span>
        <span className="text-muted-foreground">Turn {message.turn}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
        <RevealText text={text} done={done} />
      </p>
    </motion.div>
  );
}

function RevealText({ text, done }: { text: string; done: boolean }) {
  const [visible, setVisible] = React.useState("");

  React.useEffect(() => {
    if (visible.length >= text.length) {
      return;
    }
    const timer = window.setInterval(() => {
      setVisible((current) => text.slice(0, Math.min(text.length, current.length + 2)));
    }, 40);
    return () => window.clearInterval(timer);
  }, [text, visible.length]);

  React.useEffect(() => {
    if (text.length < visible.length) {
      setVisible(text);
    }
  }, [text, visible.length]);

  return (
    <>
      {visible}
      {!done ? <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-primary align-middle" /> : null}
    </>
  );
}

function CenterSpotlight({
  phase,
  speaker,
  hint,
  consensusVerdict,
  voteRound
}: {
  phase: DebatePhase;
  speaker: AgentKey | null;
  hint: string;
  consensusVerdict: CouncilVerdict | null;
  voteRound: number;
}) {
  let title = "The chamber is gathering";
  let subtitle = "Listen for the first omen.";

  if (phase === "voting") {
    title = `Vote round ${voteRound}`;
    subtitle = "The council is casting verdicts.";
  } else if (phase === "consensus" && consensusVerdict) {
    title = `Consensus: ${consensusVerdict}`;
    subtitle = "Sealing the final verdict.";
  } else if (phase === "complete") {
    title = "Verdict sealed";
    subtitle = consensusVerdict ? `Consensus: ${consensusVerdict}` : "Debate concluded.";
  } else if (speaker) {
    title = AGENT_META[speaker].name;
    subtitle = hint || "speaking…";
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[220px] -translate-x-1/2 -translate-y-1/2 text-center">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">Council</div>
      <div className="mt-2 font-serif text-lg font-bold leading-tight text-foreground">{title}</div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function buildTranscript(messages: CouncilMessage[]) {
  return messages
    .sort((a, b) => a.turn - b.turn)
    .map((message) => `${AGENT_META[message.agent].name} Turn ${message.turn}:\n${message.text}`)
    .join("\n\n");
}
