/**
 * The mark: a bolt breaking out of a cloud outline.
 *
 * Two paths, one shape — the same idea the app is built on, said in ten minutes of SVG rather
 * than a paragraph. Emerald bolt (on-device) crossing a violet cloud (in the cloud), with the
 * bolt drawn on top because the device path is the one this project argues for.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Sahayogi"
      className="shrink-0"
    >
      {/* cloud outline */}
      <path
        d="M9.5 23.5h13a4.75 4.75 0 0 0 .55-9.47 6.6 6.6 0 0 0-12.6-1.6A4.9 4.9 0 0 0 9.5 23.5Z"
        stroke="#8b5cf6"
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity="0.95"
      />
      {/* bolt */}
      <path
        d="M17.6 8.4 12.4 17h3.3l-1.3 6.6 5.2-8.6h-3.3l1.3-6.6Z"
        fill="#10b981"
        stroke="#0f0f16"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
