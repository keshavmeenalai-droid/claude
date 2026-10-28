import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#060b16", 900: "#0b1324", 850: "#0f1a30", 800: "#14213b", 700: "#1d2d4d", 600: "#2a3d63" },
        exit: "#f43f5e",
        recheck: "#f59e0b",
        trade: "#10b981",
        info: "#38bdf8",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"], mono: ["var(--font-mono)", "ui-monospace", "monospace"] },
    },
  },
  plugins: [],
} satisfies Config;
