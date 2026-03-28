import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // New premium warm dark palette
        telink: {
          // Backgrounds - warm dark tones
          bg: "#0c0a0f",
          "bg-subtle": "#110e14",
          surface: "#1a1620",
          "surface-elevated": "#221d29",
          "surface-hover": "#2a2433",

          // Borders - subtle warm grays
          border: "#2d2737",
          "border-light": "#3d3548",

          // Primary accent - warm amber/coral
          accent: "#f59e0b",
          "accent-hover": "#fbbf24",
          "accent-muted": "rgba(245, 158, 11, 0.15)",
          "accent-glow": "rgba(245, 158, 11, 0.25)",

          // Secondary accent - electric violet
          violet: "#8b5cf6",
          "violet-muted": "rgba(139, 92, 246, 0.15)",

          // Success - warm green
          success: "#22c55e",
          "success-muted": "rgba(34, 197, 94, 0.15)",

          // Text hierarchy
          text: "#faf8f5",
          "text-secondary": "#c4bfcd",
          muted: "#8b8492",
          dim: "#5c5565",
        },
      },
      fontFamily: {
        sans: ['"Geist"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
        "4xl": "1.5rem",
      },
      boxShadow: {
        "glow-sm": "0 0 15px -3px rgba(245, 158, 11, 0.2)",
        "glow-md": "0 0 25px -5px rgba(245, 158, 11, 0.25)",
        "glow-lg": "0 0 40px -10px rgba(245, 158, 11, 0.3)",
        "glow-violet": "0 0 25px -5px rgba(139, 92, 246, 0.25)",
        "inner-glow": "inset 0 1px 0 0 rgba(255,255,255,0.05)",
        "elevation-1": "0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.15)",
        "elevation-2": "0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -2px rgba(0,0,0,0.2)",
        "elevation-3": "0 10px 15px -3px rgba(0,0,0,0.35), 0 4px 6px -4px rgba(0,0,0,0.25)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-accent": "linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)",
        "gradient-violet": "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
        "gradient-surface": "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)",
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
      },
      animation: {
        "fade-in": "fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-up": "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-down": "fadeDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-right": "slideRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-left": "slideLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "float": "float 3s ease-in-out infinite",
        "progress": "progressFill 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
        "spin-slow": "spin 3s linear infinite",
        "bounce-subtle": "bounceSubtle 1s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        fadeDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        slideRight: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        slideLeft: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px 0 rgba(245, 158, 11, 0.15)" },
          "50%": { boxShadow: "0 0 35px 5px rgba(245, 158, 11, 0.25)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        progressFill: {
          "0%": { width: "0%", opacity: "0.5" },
          "100%": { width: "var(--progress-width)", opacity: "1" }
        },
        bounceSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "spring": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      },
    },
  },
  plugins: [],
};

export default config;
