export type ElementalTheme = "fire" | "water" | "earth" | "air";

export type PalmLandmark = {
  name: string;
  visibility: string;
  description: string;
  confidence: number;
};

export type PalmReading = {
  image_quality: "good" | "poor";
  dominant_element: ElementalTheme;
  landmarks: PalmLandmark[];
  reading: {
    tone: string;
    themes: string[];
    strengths: string[];
    cautions: string[];
    destiny_suggestions: string[];
  };
  is_cursed: boolean;
  destiny_score: number;
  safety_disclaimer: string;
};

export type AgentKey =
  | "ancient_oracle"
  | "rage_gremlin"
  | "hype_prophet"
  | "skeptic_scholar"
  | "chaos_neutral";

export type DebateMessage = {
  agent: AgentKey;
  round: number;
  content: string;
  done: boolean;
};

export type DebatePhase =
  | "connecting"
  | "speaking"
  | "voting"
  | "consensus"
  | "complete"
  | "error";

export type CouncilVerdict = "GO" | "NO_GO" | "PIVOT";
export type AgentVoteVerdict = CouncilVerdict | "ABSTAIN";

export type VoteTally = Record<CouncilVerdict, number>;

export type ModeratorDecision = {
  speaker: AgentKey;
  hint: string;
  reason: string;
  turn: number;
};

export type Vote = {
  agent: AgentKey;
  verdict: AgentVoteVerdict;
  confidence: number;
  reason: string;
  valid?: boolean;
  round: number;
};

export type VoteRound = {
  round: number;
  votes: Vote[];
  tally: VoteTally;
  leader: CouncilVerdict | null;
  reached_consensus: boolean;
};

export type CouncilMessage = {
  agent: AgentKey;
  turn: number;
  text: string;
};

export type CouncilEvent =
  | ({ type: "moderator" } & ModeratorDecision)
  | { type: "turn_start"; agent: AgentKey; turn: number }
  | { type: "delta"; agent: AgentKey; turn: number; content: string }
  | { type: "turn_end"; agent: AgentKey; turn: number }
  | { type: "vote_open"; round: number }
  | ({ type: "vote_cast" } & Vote)
  | {
      type: "vote_result";
      round: number;
      tally: VoteTally;
      leader: CouncilVerdict | null;
      reached_consensus: boolean;
    }
  | { type: "consensus"; verdict: CouncilVerdict | null; round: number }
  | { type: "final_delta"; content: string }
  | { type: "complete"; final_verdict?: string }
  | { type: "error"; message: string };

export type Verdict = {
  verdict_text: string;
  winning_agent: string;
  destiny_alignment: number;
  final_prophecy: string;
};
