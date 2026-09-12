/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1F2430',
        paper: '#F5F6F8',
        // Sidebar tối màu + đỏ logo, đồng bộ với DebtFlow / Gungho
        navy: {
          50: '#EEF0F4', 400: '#3A4152', 600: '#232837',
          800: '#161A24', 900: '#10131C',
        },
        brand: {
          // xanh dương làm màu hành động chính (nút, link) — giống 2 app kia
          50: '#EAF1FE', 100: '#D3E3FD', 300: '#8FB6F8', 500: '#2F6FEB',
          600: '#2563EB', 700: '#1D4ED8',
        },
        crimson: {
          500: '#E23B3B', 600: '#DC2626', 700: '#B91C1C',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
