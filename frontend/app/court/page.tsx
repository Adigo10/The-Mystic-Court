"use client";

import * as React from "react";
import { Send } from "lucide-react";

import AgentCard from "@/components/AgentCard";
import DebateArena from "@/components/DebateArena";
import OracleVerdict from "@/components/OracleVerdict";
import PalmScanner from "@/components/PalmScanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { PalmReading } from "@/lib/types";

export default function CourtPage() {
  const [palmReading, setPalmReading] = React.useState<PalmReading | null>(null);
  const [idea, setIdea] = React.useState("");
  const [submittedIdea, setSubmittedIdea] = React.useState("");
  const [debateTranscript, setDebateTranscript] = React.useState("");

  function submitIdea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = idea.trim();
    if (!trimmed) {
      return;
    }
    setSubmittedIdea(trimmed);
    setDebateTranscript("");
  }

  return (
    <main className="mystic-frame min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-black tracking-wide text-shimmer sm:text-5xl">
              The Court Is In Session
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              A three-step ritual: scan the palm, pitch the idea, then survive the debate.
            </p>
          </div>
          <div className="text-sm uppercase tracking-[0.24em] text-primary">Live tribunal</div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="space-y-6">
            <PalmScanner onReading={setPalmReading} />

            {palmReading ? (
              <Card>
                <CardHeader>
                  <CardTitle>Step 2: Pitch the Idea</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitIdea} className="space-y-4">
                    <Textarea
                      value={idea}
                      onChange={(event) => setIdea(event.target.value)}
                      placeholder="Describe the startup, product, art project, scheme, or cursed little thought you want judged."
                    />
                    <Button type="submit" disabled={!idea.trim()}>
                      <Send className="h-4 w-4" />
                      Summon the Agents
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            {submittedIdea && palmReading ? (
              <>
                <DebateArena
                  idea={submittedIdea}
                  palmContext={palmReading}
                  onComplete={setDebateTranscript}
                />
                <OracleVerdict
                  idea={submittedIdea}
                  palmReading={palmReading}
                  debateTranscript={debateTranscript}
                />
              </>
            ) : (
              <Card className="min-h-[440px]">
                <CardHeader>
                  <CardTitle>Step 3: Await the Court</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["ancient_oracle", "The Ancient Oracle", "𓂀"],
                    ["rage_gremlin", "The Rage Gremlin", "!!"],
                    ["hype_prophet", "The Hype Prophet", "^"],
                    ["skeptic_scholar", "The Skeptic Scholar", "?"]
                  ].map(([agentKey, agentName, emoji]) => (
                    <AgentCard
                      key={agentKey}
                      agentKey={agentKey}
                      agentName={agentName}
                      emoji={emoji}
                      round={1}
                      content="The agent waits behind the veil."
                      done
                      mood="dormant"
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
