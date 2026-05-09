"use client";

import * as React from "react";
import { Download, Scale } from "lucide-react";
import { motion } from "framer-motion";

import CrystalBallLoader from "@/components/CrystalBallLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PalmReading, Verdict } from "@/lib/types";

const API_BASE = "http://localhost:8000";

export default function OracleVerdict({
  idea,
  palmReading,
  debateTranscript
}: {
  idea: string;
  palmReading: PalmReading;
  debateTranscript: string;
}) {
  const [verdict, setVerdict] = React.useState<Verdict | null>(null);
  const [oracleCardUrl, setOracleCardUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!debateTranscript) {
      return;
    }

    let cancelled = false;
    async function fetchVerdict() {
      setLoading(true);
      setError("");
      setVerdict(null);
      setOracleCardUrl("");
      try {
        const response = await fetch(`${API_BASE}/api/verdict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea,
            palm_reading: palmReading,
            debate_transcript: debateTranscript
          })
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as { verdict: Verdict; oracle_card_url: string };
        if (!cancelled) {
          setVerdict(data.verdict);
          setOracleCardUrl(data.oracle_card_url);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Verdict failed.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchVerdict();
    return () => {
      cancelled = true;
    };
  }, [debateTranscript, idea, palmReading]);

  if (!debateTranscript) {
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          Oracle Verdict
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <CrystalBallLoader label="Forging the final card" /> : null}
        {error ? (
          <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}
        {verdict ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45 }}
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
          >
            <div className="space-y-5">
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-primary">Winning agent</p>
                <p className="mt-2 font-serif text-2xl font-black">{verdict.winning_agent}</p>
              </div>
              <p className="text-base leading-8 text-foreground/90">{verdict.verdict_text}</p>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>Destiny alignment</span>
                  <span className="font-bold text-primary">{verdict.destiny_alignment}/100</span>
                </div>
                <Progress value={verdict.destiny_alignment} />
              </div>
              <blockquote className="border-l-2 border-primary pl-4 font-serif text-xl leading-8 text-foreground">
                {verdict.final_prophecy}
              </blockquote>
            </div>

            {oracleCardUrl ? (
              <div className="space-y-3">
                <img
                  src={oracleCardUrl}
                  alt="Generated oracle card"
                  className="aspect-[4/7] w-full rounded-lg border border-border object-cover shadow-glow"
                />
                <Button asChild variant="outline" className="w-full">
                  <a href={oracleCardUrl} download="the-mystic-court-oracle-card.png">
                    <Download className="h-4 w-4" />
                    Download Oracle Card
                  </a>
                </Button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </CardContent>
    </Card>
  );
}
