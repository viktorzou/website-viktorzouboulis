import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F6F2",
        ink: "#1C1C1A",
        muted: "#6B6B63",
        accent: "#0F766E",
        charcoal: "#121411",
      },
      fontFamily: {
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      typography: ({ theme }) => ({
        ink: {
          css: {
            "--tw-prose-body": theme("colors.ink"),
            "--tw-prose-headings": theme("colors.ink"),
            "--tw-prose-lead": theme("colors.muted"),
            "--tw-prose-links": theme("colors.accent"),
            "--tw-prose-bold": theme("colors.ink"),
            "--tw-prose-counters": theme("colors.muted"),
            "--tw-prose-bullets": theme("colors.accent"),
            "--tw-prose-hr": "rgba(28, 28, 26, 0.12)",
            "--tw-prose-quotes": theme("colors.ink"),
            "--tw-prose-quote-borders": theme("colors.accent"),
            "--tw-prose-captions": theme("colors.muted"),
            "--tw-prose-code": theme("colors.ink"),
            "--tw-prose-pre-code": theme("colors.paper"),
            "--tw-prose-pre-bg": theme("colors.ink"),
            "--tw-prose-th-borders": "rgba(28, 28, 26, 0.12)",
            "--tw-prose-td-borders": "rgba(28, 28, 26, 0.08)",
            "--tw-prose-invert-body": theme("colors.paper"),
            "--tw-prose-invert-headings": theme("colors.paper"),
            "--tw-prose-invert-lead": "#A8A89E",
            "--tw-prose-invert-links": "#2DD4BF",
            "--tw-prose-invert-bold": theme("colors.paper"),
            "--tw-prose-invert-counters": "#A8A89E",
            "--tw-prose-invert-bullets": "#2DD4BF",
            "--tw-prose-invert-hr": "rgba(247, 246, 242, 0.12)",
            "--tw-prose-invert-quotes": theme("colors.paper"),
            "--tw-prose-invert-quote-borders": "#2DD4BF",
            "--tw-prose-invert-captions": "#A8A89E",
            "--tw-prose-invert-code": theme("colors.paper"),
            "--tw-prose-invert-pre-code": theme("colors.paper"),
            "--tw-prose-invert-pre-bg": "#0A0B0A",
            "--tw-prose-invert-th-borders": "rgba(247, 246, 242, 0.12)",
            "--tw-prose-invert-td-borders": "rgba(247, 246, 242, 0.08)",
            fontFamily: theme("fontFamily.mono").join(", "),
            a: {
              textDecoration: "underline",
              textUnderlineOffset: "3px",
              fontWeight: "500",
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
  darkMode: "class",
};
