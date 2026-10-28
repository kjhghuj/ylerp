/** @type {import('tailwindcss').Config} */
const ui = (token) => `hsl(var(--ui-${token}) / <alpha-value>)`;

module.exports = {
  darkMode: ['class'],
  content: [
    './index.html', './*.{ts,tsx}',
    './components/**/*.{ts,tsx}', './modules/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}', './src/**/*.{ts,tsx}',
    './locales/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1440px' } },
    extend: {
      colors: {
        border: ui('border'), input: ui('input'), ring: ui('ring'),
        background: ui('background'), foreground: ui('foreground'),
        primary: { DEFAULT: ui('primary'), foreground: ui('primary-foreground'), light: '#60a5fa', dark: '#2563eb' },
        secondary: { DEFAULT: ui('secondary'), foreground: ui('secondary-foreground') },
        destructive: { DEFAULT: ui('destructive'), foreground: ui('destructive-foreground') },
        danger: ui('danger'),
        muted: { DEFAULT: ui('muted'), foreground: ui('muted-foreground') },
        accent: { DEFAULT: ui('accent'), foreground: ui('accent-foreground') },
        popover: { DEFAULT: ui('popover'), foreground: ui('popover-foreground') },
        card: { DEFAULT: ui('card'), foreground: ui('card-foreground') },
        success: { DEFAULT: ui('success'), foreground: ui('success-foreground'), subtle: ui('success-subtle') },
        warning: { DEFAULT: ui('warning'), foreground: ui('warning-foreground'), subtle: ui('warning-subtle') },
        brand: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81' },
      },
      borderRadius: { lg: 'var(--ui-radius)', md: 'calc(var(--ui-radius) - 2px)', sm: 'calc(var(--ui-radius) - 4px)' },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: { 'accordion-down': 'accordion-down 0.2s ease-out', 'accordion-up': 'accordion-up 0.2s ease-out' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};


