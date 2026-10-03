import type { Config } from "tailwindcss";

// Design tokens from §11 of the build prompt.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#F4F2EE",
        surface: "#FFFFFF",
        ink: "#1A1A18",
        muted: "#5C5A55",
        line: "#DEDAD2",
        line2: "#EEEAE3",
        side: "#1C1B19",
        accent: { DEFAULT: "#BF5700", ink: "#9A4600" },
        data: "#2F5D8A",
        chip: {
          pendingBg: "#FCEBD3",
          pendingFg: "#7A3E00",
          approvedBg: "#DCE8F5",
          approvedFg: "#1E4468",
          eslBg: "#2F5D8A",
          receivedBg: "#1A1A18",
          returnedBg: "#ECEAE6",
          rejectedBg: "#F6DCD5",
          rejectedFg: "#7D2512",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Arial Narrow", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      maxWidth: { content: "1280px" },
      width: { sidebar: "232px" },
    },
  },
  plugins: [],
};

export default config;
