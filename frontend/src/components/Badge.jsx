const VARIANTS = {
  green: { bg: '#DCFCE7', text: '#15803D' },
  gray: { bg: '#F1F5F9', text: '#475569' },
  blue: { bg: '#DBEAFE', text: '#1D4ED8' },
  purple: { bg: '#EDE9FE', text: '#6D28D9' },
  amber: { bg: '#FEF3C7', text: '#B45309' },
  red: { bg: '#FFE4E6', text: '#BE123C' },
}

export default function Badge({ children, variant = 'gray' }) {
  const { bg, text } = VARIANTS[variant] || VARIANTS.gray
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: bg, color: text }}
    >
      {children}
    </span>
  )
}
