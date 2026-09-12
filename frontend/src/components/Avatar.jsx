const PALETTE = [
  { bg: '#EDE9FE', text: '#6D28D9' }, // tím
  { bg: '#DBEAFE', text: '#1D4ED8' }, // xanh dương
  { bg: '#DCFCE7', text: '#15803D' }, // xanh lá
  { bg: '#CFFAFE', text: '#0E7490' }, // xanh ngọc
  { bg: '#FFE4E6', text: '#BE123C' }, // hồng
  { bg: '#FEF3C7', text: '#B45309' }, // vàng
]

function colorFor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export default function Avatar({ name = '', size = 32 }) {
  const initial = (name.trim()[0] || '?').toUpperCase()
  const { bg, text } = colorFor(name)
  return (
    <div
      className="rounded-full flex items-center justify-center font-medium shrink-0"
      style={{ width: size, height: size, background: bg, color: text, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  )
}
