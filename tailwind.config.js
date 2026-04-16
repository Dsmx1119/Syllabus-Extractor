/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        shell: '#f7f6f2',
        ink: '#10211b',
        moss: '#6c8b55',
        pine: '#1e4d3b',
        lime: '#c6f36a',
        sand: '#efe8d8',
        cloud: '#fffdf8',
      },
      boxShadow: {
        soft: '0 20px 60px rgba(16, 33, 27, 0.10)',
        glow: '0 18px 45px rgba(198, 243, 106, 0.24)',
      },
      backgroundImage: {
        aurora:
          'radial-gradient(circle at top left, rgba(198, 243, 106, 0.28), transparent 35%), radial-gradient(circle at bottom right, rgba(108, 139, 85, 0.18), transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.92), rgba(239,232,216,0.96))',
      },
    },
  },
  plugins: [],
};
