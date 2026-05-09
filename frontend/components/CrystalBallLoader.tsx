"use client";

export default function CrystalBallLoader({ label = "Consulting the veil" }: { label?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card/70 p-4">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-pulseGlow rounded-full bg-primary/30 blur-xl" />
        <svg viewBox="0 0 100 100" className="relative h-16 w-16">
          <defs>
            <radialGradient id="crystal" cx="35%" cy="25%" r="70%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="34%" stopColor="currentColor" stopOpacity="0.55" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="43" r="32" fill="url(#crystal)" className="text-primary" />
          <path d="M28 81h44l-7 9H35z" fill="currentColor" className="text-primary/55" />
          <path
            d="M25 72h50"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            className="text-primary/60"
          />
          <circle cx="39" cy="32" r="4" fill="white" opacity="0.85">
            <animate attributeName="cy" values="32;25;32" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="57" cy="50" r="2.4" fill="white" opacity="0.65">
            <animate attributeName="cx" values="57;68;57" dur="2.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="48" cy="60" r="1.8" fill="white" opacity="0.55">
            <animate attributeName="cy" values="60;47;60" dur="3.1s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      <div>
        <p className="font-serif text-lg font-bold">{label}</p>
        <p className="text-sm text-muted-foreground">The crystal is arranging improbable conclusions.</p>
      </div>
    </div>
  );
}
