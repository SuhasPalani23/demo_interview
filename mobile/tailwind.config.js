/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface: "#141414",
        "surface-elevated": "#1c1c1c",
        border: "#2a2a2a",
        "border-focus": "#404040",
        accent: "#e8d5b0",
        "accent-dim": "#b8a882",
        "text-primary": "#f0ece4",
        "text-secondary": "#8a8278",
        "text-muted": "#4a4642",
        streaming: "#a3c4a8",
        "streaming-dim": "#6b8f70",
        danger: "#c4736b",
      },
      fontFamily: {
        mono: ["SpaceMono"],
      },
    },
  },
};
