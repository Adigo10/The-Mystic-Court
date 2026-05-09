"use client";

import * as React from "react";

import type { ElementalTheme } from "@/lib/types";

type MysticThemeContextValue = {
  element: ElementalTheme;
  cursed: boolean;
  setElement: (element: ElementalTheme) => void;
  setCursed: (cursed: boolean) => void;
};

const MysticThemeContext = React.createContext<MysticThemeContextValue | null>(null);

export function MysticThemeProvider({ children }: { children: React.ReactNode }) {
  const [element, setElement] = React.useState<ElementalTheme>("fire");
  const [cursed, setCursed] = React.useState(false);

  return (
    <MysticThemeContext.Provider value={{ element, cursed, setElement, setCursed }}>
      <ThemeHtmlBridge element={element} cursed={cursed} />
      {children}
    </MysticThemeContext.Provider>
  );
}

function ThemeHtmlBridge({ element, cursed }: { element: ElementalTheme; cursed: boolean }) {
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("element-fire", "element-water", "element-earth", "element-air", "cursed");
    root.classList.add(`element-${element}`);
    if (cursed) {
      root.classList.add("cursed");
    }
  }, [element, cursed]);

  return null;
}

export function useMysticTheme() {
  const value = React.useContext(MysticThemeContext);
  if (!value) {
    throw new Error("useMysticTheme must be used inside MysticThemeProvider");
  }
  return value;
}
