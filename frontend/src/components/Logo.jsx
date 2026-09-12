export default function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#DC2626" />
      <path
        d="M20 8 L30 20 L20 32 L10 20 Z"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
      />
      <path
        d="M20 15 L25 20 L20 25 L15 20 Z"
        fill="white"
      />
    </svg>
  )
}
