/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#6366F1',
          'primary-hover': '#818CF8',
          secondary: '#8B5CF6',
          'secondary-hover': '#A78BFA',
        },
        surface: {
          DEFAULT: '#0F0F23',
          alt: '#1A1A2E',
          card: 'rgba(255,255,255,0.05)',
          'card-hover': 'rgba(255,255,255,0.08)',
          overlay: 'rgba(0,0,0,0.6)',
        },
        shard: {
          1: '#6366F1',
          2: '#8B5CF6',
          3: '#EC4899',
          4: '#F59E0B',
        },
      },
      fontFamily: {
        sans: ["'Inter'", "'PingFang SC'", "'Microsoft YaHei'", 'sans-serif'],
        mono: ["'JetBrains Mono'", "'Cascadia Code'", "'Fira Code'", 'monospace'],
      },
      animation: {
        'shred': 'shred 600ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'assemble': 'assemble 800ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 300ms ease-out forwards',
      },
      keyframes: {
        shred: {
          '0%': { opacity: '1', transform: 'scale(1)', filter: 'blur(0)' },
          '50%': { opacity: '0.6', transform: 'scale(1.02)', filter: 'blur(2px)' },
          '100%': { opacity: '0', transform: 'scale(0.8)', filter: 'blur(8px)' },
        },
        assemble: {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.95)', filter: 'blur(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(99,102,241,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(99,102,241,0.6)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
