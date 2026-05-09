import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mystic-frame min-h-screen overflow-hidden">
      <section className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full border border-primary/30 bg-primary/10 blur-3xl" />
        <div className="relative flex h-24 w-24 animate-float items-center justify-center rounded-full border border-primary/40 bg-card shadow-glow">
          <Sparkles className="h-10 w-10 text-primary" />
        </div>
        <h1 className="relative mt-8 max-w-5xl animate-shimmer bg-[linear-gradient(90deg,hsl(var(--foreground)),hsl(var(--primary)),hsl(var(--foreground)))] bg-[length:200%_auto] bg-clip-text font-serif text-5xl font-black leading-tight text-transparent sm:text-7xl lg:text-8xl">
          THE MYSTIC COURT
        </h1>
        <p className="relative mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
          Submit your palm. Pitch your idea. Let five unruly AI archetypes argue over your fate before the oracle renders judgment.
        </p>
        <Button asChild size="lg" className="relative mt-9">
          <Link href="/court">
            Enter the Court
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div className="relative mt-16 grid w-full max-w-3xl grid-cols-3 gap-3 text-left text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <div className="border-t border-border pt-3">Palm omen</div>
          <div className="border-t border-border pt-3">Agent debate</div>
          <div className="border-t border-border pt-3">Oracle card</div>
        </div>
      </section>
    </main>
  );
}
