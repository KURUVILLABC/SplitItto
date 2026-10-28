import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#161d19",
        muted: "#77827b",
        paper: "#f7f8f5",
        brand: "#246b4a",
        lime: "#d9f36a",
      },
      boxShadow: {
        soft: "0 18px 55px rgba(29, 47, 36, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
