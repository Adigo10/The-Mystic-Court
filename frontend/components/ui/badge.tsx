import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-accent/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}
