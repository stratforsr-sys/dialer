import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // TELINK - Theme-aware using CSS variables
        // Legacy naming convention - maps to same CSS variables as cockpit
        telink: {
          bg: "var(--bg)",
          "bg-subtle": "var(--bg-subtle)",
          "bg-muted": "var(--bg-muted)",
          surface: "var(--surface)",
          "surface-hover": "var(--surface-hover)",
          "surface-elevated": "var(--surface-elevated)",
          "surface-inset": "var(--surface-inset)",
          border: "var(--border)",
          "border-light": "var(--border-strong)",
          text: "var(--text)",
          "text-secondary": "var(--text-secondary)",
          muted: "var(--text-muted)",
          dim: "var(--text-dim)",
          accent: "var(--accent)",
          "accent-muted": "var(--accent-muted)",
          "accent-hover": "var(--success)",
          violet: "#8b5cf6",
        },
        // ELITE ENGINEER - Theme-aware using CSS variables
        // These follow the light/dark theme automatically
        cockpit: {
          // Backgrounds - Using CSS variables
          bg: "var(--bg)",
          "bg-subtle": "var(--bg-subtle)",
          "bg-muted": "var(--bg-muted)",
          surface: "var(--surface)",
          "surface-hover": "var(--surface-hover)",
          "surface-elevated": "var(--surface-elevated)",
          "surface-inset": "var(--surface-inset)",

          // Borders - Using CSS variables
          border: "var(--border)",
          "border-subtle": "var(--border-subtle)",
          "border-strong": "var(--border-strong)",
          "border-focus": "var(--border-focus)",

          // Text hierarchy - Using CSS variables
          text: "var(--text)",
          "text-secondary": "var(--text-secondary)",
          "text-muted": "var(--text-muted)",
          "text-dim": "var(--text-dim)",
          "text-faint": "var(--text-faint)",

          // Functional accents - Using CSS variables
          success: "var(--success)",
          "success-bg": "var(--success-bg)",
          "success-border": "var(--success-border)",
          danger: "var(--danger)",
          "danger-bg": "var(--danger-bg)",
          "danger-border": "var(--danger-border)",
          warning: "var(--warning)",
          "warning-bg": "var(--warning-bg)",
          "warning-border": "var(--warning-border)",
          info: "var(--info)",
          "info-bg": "var(--info-bg)",
          "info-border": "var(--info-border)",

          // LinkedIn
          linkedin: "var(--linkedin)",
          "linkedin-bg": "var(--linkedin-bg)",

          // Accent - Single brand accent
          accent: "var(--accent)",
          "accent-muted": "var(--accent-muted)",
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
