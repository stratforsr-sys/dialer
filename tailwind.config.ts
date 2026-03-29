import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Engineering-grade monochromatic palette
        // Inspired by Linear, Vercel, Apple
        cockpit: {
          // Backgrounds - subtle depth without color
          bg: "#fafafa",
          "bg-subtle": "#f5f5f5",
          "bg-muted": "#ebebeb",
          surface: "#ffffff",
          "surface-hover": "#f8f8f8",
          "surface-elevated": "#ffffff",
          "surface-inset": "#f0f0f0",

          // Borders - barely visible separation
          border: "rgba(0, 0, 0, 0.06)",
          "border-subtle": "rgba(0, 0, 0, 0.04)",
          "border-strong": "rgba(0, 0, 0, 0.10)",
          "border-focus": "rgba(0, 0, 0, 0.15)",

          // Text hierarchy - NO pure black
          text: "#09090b",
          "text-secondary": "#3f3f46",
          "text-muted": "#71717a",
          "text-dim": "#a1a1aa",
          "text-faint": "#d4d4d8",

          // Functional accents ONLY
          success: "#16a34a",
          "success-bg": "rgba(22, 163, 74, 0.08)",
          danger: "#dc2626",
          "danger-bg": "rgba(220, 38, 38, 0.08)",
          warning: "#d97706",
          "warning-bg": "rgba(217, 119, 6, 0.08)",
          info: "#0284c7",
          "info-bg": "rgba(2, 132, 199, 0.08)",

          // LinkedIn blue for LinkedIn features
          linkedin: "#0a66c2",
          "linkedin-bg": "rgba(10, 102, 194, 0.08)",
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Geist"', "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Geist Mono"', "Menlo", "Monaco", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
      letterSpacing: {
        "tight-pro": "-0.02em",
        "tight-body": "-0.011em",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        // Layered double shadows - the "engineering" way
        "elevation-1": "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        "elevation-2": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)",
        "elevation-3": "0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)",
        "elevation-4": "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",

        // Card shadows with ambient occlusion effect
        "card": "0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.04)",
        "card-hover": "0 4px 12px -2px rgba(0, 0, 0, 0.12), 0 2px 4px -2px rgba(0, 0, 0, 0.06)",
        "card-active": "0 0 0 2px rgba(0, 0, 0, 0.08)",

        // Button shadows - tactile inner glow
        "button": "0 1px 2px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
        "button-hover": "0 2px 4px 0 rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)",

        // Inner glow for skeuomorphic details
        "inner-glow": "inset 0 1px 0 0 rgba(255, 255, 255, 0.8)",
        "inner-shadow": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.04)",

        // Focus ring
        "ring": "0 0 0 3px rgba(0, 0, 0, 0.08)",
        "ring-success": "0 0 0 3px rgba(22, 163, 74, 0.15)",
        "ring-danger": "0 0 0 3px rgba(220, 38, 38, 0.15)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "fade-up": "fadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-down": "fadeDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-left": "slideInLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-out-left": "slideOutLeft 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-out-right": "slideOutRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-subtle": "pulseSubtle 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "kbd-press": "kbdPress 0.1s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        fadeDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        slideOutLeft: {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(-12px)" }
        },
        slideOutRight: {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(12px)" }
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        kbdPress: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.95)" },
          "100%": { transform: "scale(1)" }
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
