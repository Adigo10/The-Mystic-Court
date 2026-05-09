import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel } from "next/font/google";

import { MysticThemeProvider } from "@/components/MysticThemeProvider";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap"
});

export const metadata: Metadata = {
  title: "The Mystic Court",
  description: "Palm reading, AI debate, and oracle verdicts for your wildest ideas."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${cinzel.variable} element-fire`} suppressHydrationWarning>
      <body>
        <MysticThemeProvider>{children}</MysticThemeProvider>
      </body>
    </html>
  );
}
