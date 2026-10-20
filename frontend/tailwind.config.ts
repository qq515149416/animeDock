import type { Config } from "tailwindcss";
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: rgb("--bg"),
        card: rgb("--card"),
        elev: rgb("--elev"),
        elev2: rgb("--elev2"),
        fg: rgb("--fg"),
        mut: rgb("--mut"),
        line: rgb("--line"),
        sakura: rgb("--sakura"),
        ind: rgb("--ind"),
      },
      opacity: {
        "7": ".07",
        "8": ".08",
        "12": ".12",
        "15": ".15",
        "35": ".35",
        "45": ".45",
        "55": ".55",
        "65": ".65",
        "85": ".85",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / .06), 0 4px 14px -6px rgb(0 0 0 / var(--sh))",
        cardh:
          "0 2px 4px rgb(0 0 0 / .08), 0 18px 36px -12px rgb(0 0 0 / var(--shh))",
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Noto Sans SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
