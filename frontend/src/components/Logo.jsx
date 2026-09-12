export default function Logo({ size = 36 }) {
  return (
    <img
      src="/logo.jpg"
      alt="HTC - QL - KHO"
      width={size}
      height={size}
      className="rounded-lg object-cover"
      style={{ width: size, height: size }}
    />
  )
}
