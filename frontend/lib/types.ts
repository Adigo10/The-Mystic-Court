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

export type Verdict = {
  verdict_text: string;
  winning_agent: string;
  destiny_alignment: number;
  final_prophecy: string;
};
