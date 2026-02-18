import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        jrpg: "var(--jrpg-border-radius)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        jrpg: {
          panel: {
            DEFAULT: "var(--jrpg-panel-bg)",
            raised: "var(--jrpg-panel-bg-raised)",
            border: "var(--jrpg-panel-border)",
            "border-gold": "var(--jrpg-panel-border-gold)",
          },
          text: {
            DEFAULT: "var(--jrpg-text-primary)",
            secondary: "var(--jrpg-text-secondary)",
            accent: "var(--jrpg-text-accent)",
            danger: "var(--jrpg-text-danger)",
            muted: "var(--jrpg-text-muted)",
          },
          btn: {
            primary: "var(--jrpg-btn-primary-bg)",
            "primary-text": "var(--jrpg-btn-primary-text)",
            danger: "var(--jrpg-btn-danger-bg)",
            "danger-text": "var(--jrpg-btn-danger-text)",
          },
          health: {
            high: "var(--jrpg-health-high)",
            mid: "var(--jrpg-health-mid)",
            low: "var(--jrpg-health-low)",
          },
          xp: "var(--jrpg-xp-fill)",
          mana: "var(--jrpg-mana-fill)",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      spacing: {
        "jrpg-xs": "var(--jrpg-space-xs)",
        "jrpg-sm": "var(--jrpg-space-sm)",
        "jrpg-md": "var(--jrpg-space-md)",
        "jrpg-lg": "var(--jrpg-space-lg)",
        "jrpg-xl": "var(--jrpg-space-xl)",
      },
      fontFamily: {
        jrpg: ["Press Start 2P", "Courier New", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
