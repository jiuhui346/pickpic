/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel-2)",
        line: "var(--line)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        danger: "var(--danger)",
      },
      borderRadius: {
        card: "8px",
        dlg: "12px",
      },
    },
  },
  plugins: [],
};
