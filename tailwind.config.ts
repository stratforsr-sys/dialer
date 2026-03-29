import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ELITE ENGINEER - Deep Zinc Monochrome
        // Inspired by Linear, Vercel, Stripe
        cockpit: {
          // Backgrounds - Deep black hierarchy
          bg: "#020202",
          "bg-subtle": "#0a0a0a",
          "bg-muted": "#0f0f0f",
          surface: "#09090b",
          "surface-hover": "#0c0c0e",
          "surface-elevated": "#111113",
          "surface-inset": "#060608",

          // Borders - Barely visible precision lines
          border: "#18181b",
          "border-subtle": "#141416",
          "border-strong": "#27272a",
          "border-focus": "#3f3f46",

          // Text hierarchy - Silver scale
          text: "#fafafa",
          "text-secondary": "#d4d4d8",
          "text-muted": "#a1a1aa",
          "text-dim": "#71717a",
          "text-faint": "#52525b",

          // Functional accents - Muted, professional
          success: "#22c55e",
          "success-bg": "rgba(34, 197, 94, 0.10)",
          "success-border": "rgba(34, 197, 94, 0.20)",
          danger: "#ef4444",
          "danger-bg": "rgba(239, 68, 68, 0.10)",
          "danger-border": "rgba(239, 68, 68, 0.20)",
          warning: "#f59e0b",
          "warning-bg": "rgba(245, 158, 11, 0.10)",
          "warning-border": "rgba(245, 158, 11, 0.20)",
          info: "#3b82f6",
          "info-bg": "rgba(59, 130, 246, 0.10)",
          "info-border": "rgba(59, 130, 246, 0.20)",

          // LinkedIn
          linkedin: "#0a66c2",
          "linkedin-bg": "rgba(10, 102, 194, 0.12)",

          // Accent - Single brand accent
          accent: "#22c55e",
          "accent-muted": "rgba(34, 197, 94, 0.15)",
        },
      },
      fontFamily: {
        sans: ['"Geist"', '"Inter"', "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', "Menlo", "Monaco", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
        "3xs": ["0.55rem", { lineHeight: "0.85rem" }],
      },
      letterSpacing: {
        "tighter": "-0.04em",
        "tight-pro": "-0.02em",
        "tight-body": "-0.011em",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        // Ambient occlusion - Double shadows for depth
        "elevation-1": "0 1px 2px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)",
        "elevation-2": "0 2px 4px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3)",
        "elevation-3": "0 4px 8px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.25)",
        "elevation-4": "0 8px 16px rgba(0, 0, 0, 0.4), 0 16px 32px rgba(0, 0, 0, 0.2)",

        // Card shadows - Subtle glow
        "card": "0 0 0 1px rgba(255, 255, 255, 0.03), 0 1px 2px rgba(0, 0, 0, 0.5)",
        "card-hover": "0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.4)",
        "card-active": "0 0 0 1px rgba(34, 197, 94, 0.3), 0 0 12px rgba(34, 197, 94, 0.1)",

        // Glow effects
        "glow-success": "0 0 20px rgba(34, 197, 94, 0.15)",
        "glow-danger": "0 0 20px rgba(239, 68, 68, 0.15)",
        "glow-info": "0 0 20px rgba(59, 130, 246, 0.15)",

        // Inner shadows
        "inner-glow": "inset 0 1px 0 0 rgba(255, 255, 255, 0.03)",
        "inner-shadow": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)",

        // Focus ring
        "ring": "0 0 0 2px rgba(34, 197, 94, 0.3)",
        "ring-white": "0 0 0 2px rgba(255, 255, 255, 0.1)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-up": "fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-down": "fadeDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-left": "slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-subtle": "pulseSubtle 3s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "spin-slow": "spin 3s linear infinite",
        "bounce-subtle": "bounceSubtle 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        fadeDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(34, 197, 94, 0.1)" },
          "50%": { boxShadow: "0 0 30px rgba(34, 197, 94, 0.2)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        bounceSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" }
        },
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "spring": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
