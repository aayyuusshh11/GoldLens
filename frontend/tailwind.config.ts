import type { Config } from "tailwindcss";

/**
 * GoldLens design tokens — docs/DESIGN_SYSTEM.md + SKILLS.md.
 * Neutral graphite shell, one gold accent, semantic pos/neg/warn used only
 * for their meaning. Chart series colors live in src/lib/charts/chartColors.ts.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B0D10",
        surface: "#12161B",
        elevated: "#191F26",
        line: "#2A313A",
        ink: "#F3F4F6",
        mute: "#9CA3AF",
        gold: "#C7A45B",
        pos: "#35B887",
        neg: "#E16D72",
        warn: "#E5B45B",
      },
      fontFamily: {
        sans: ["InterVariable", "Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      maxWidth: {
        content: "76rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
