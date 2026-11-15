/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        line: 'var(--line)',
        'line-2': 'var(--line-2)',
        ink: 'var(--text)',
        'ink-2': 'var(--text-2)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['Literata', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { panel: '20px' },
      transitionTimingFunction: { out: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    },
  },
  plugins: [],
}
