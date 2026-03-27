import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        telink: {
          bg: "#f5f6f8",
          surface: "#ffffff",
          "surface-light": "#f0f1f4",
          "surface-hover": "#e8eaef",
          border: "#e2e5eb",
          "border-light": "#d0d4dc",
          green: "#2bb574",
          "green-dark": "#239960",
          "green-light": "#eaf8f1",
          "green-border": "#b8e6d0",
          text: "#1a2233",
          muted: "#6b7a8d",
          dim: "#9aa5b4",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "slide-right": "slideRight 0.3s ease-out",
        "pulse-green": "pulseGreen 2s ease-in-out infinite",
        "progress": "progressFill 0.8s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideRight: { "0%": { opacity: "0", transform: "translateX(-12px)" }, "100%": { opacity: "1", transform: "translateX(0)" } },
        pulseGreen: { "0%,100%": { boxShadow: "0 0 0 0 rgba(61,214,140,0.3)" }, "50%": { boxShadow: "0 0 20px 4px rgba(61,214,140,0.15)" } },
        progressFill: { "0%": { width: "0%" }, "100%": { width: "var(--progress-width)" } },
      },
    },
  },
  plugins: [],
};

export default config;
