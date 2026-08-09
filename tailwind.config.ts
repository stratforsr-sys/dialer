import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // CLICKNET - Theme-aware using CSS variables
        // Legacy naming convention - maps to same CSS variables as cockpit
        clicknet: {
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
          "accent-hover": "var(--accent-hover)",
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
          "accent-hover": "var(--accent-hover)",
          "accent-border": "var(--accent-border)",
          "on-accent": "var(--on-accent)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", '"Inter"', "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", '"JetBrains Mono"', "Menlo", "Monaco", "monospace"],
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
      // Fyra radier. Fler går inte att hålla ihop över 34 komponenter —
      // tidigare fanns tretton hårdkodade värden mellan 3px och 20px.
      borderRadius: {
        DEFAULT: "var(--r-md)",
        none: "0",
        sm: "var(--r-sm)",   // 6px  — badge, kbd, tagg, progress
        md: "var(--r-md)",   // 10px — knapp, input, nav-item, rad
        lg: "var(--r-lg)",   // 14px — kort, panel, modal
        xl: "var(--r-lg)",
        "2xl": "var(--r-lg)",
        "3xl": "var(--r-lg)",
        full: "var(--r-full)",
      },
      // Elevation är en relation, inte dekoration. Se doktrinen överst
      // i globals.css. Tailwinds egna sm/md/lg/xl pekas om hit så att
      // en klass aldrig kan smita förbi skalan.
      boxShadow: {
        none: "none",
        "elevation-0": "none",
        "elevation-1": "var(--shadow-1)",
        "elevation-2": "var(--shadow-2)",
        "elevation-3": "var(--shadow-3)",
        "elevation-4": "var(--shadow-4)",
        sm: "var(--shadow-1)",
        DEFAULT: "var(--shadow-1)",
        md: "var(--shadow-2)",
        lg: "var(--shadow-3)",
        xl: "var(--shadow-4)",
        "2xl": "var(--shadow-4)",
        inner: "var(--shadow-inset)",
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
          "0%, 100%": { boxShadow: "0 0 0 0 var(--accent-ring)" },
          "50%": { boxShadow: "0 0 0 4px transparent" }
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
