/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7CE262',
          mid: '#66A754',
          deep: '#3F7A31',
          soft: '#E9F8E0',
        },
        ink: '#0B0B0F',
        page: '#F4F3F8',
        shell: '#FCFCFD',
        txt: {
          primary: '#17171C',
          body: '#4A4A55',
          mute: '#6A6A76',
          faint: '#8D8D99',
        },
      },
      borderRadius: {
        card: '20px',
      },
      boxShadow: {
        card: '0 10px 40px -12px rgba(23, 23, 40, 0.10)',
        soft: '0 4px 20px -6px rgba(23, 23, 40, 0.08)',
      },
    },
  },
  plugins: [],
}
