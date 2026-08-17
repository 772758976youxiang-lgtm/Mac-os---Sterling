import type { IconProps } from './icons/props.ts'

const sterlingRoseSource = '/branding/sterling-rose-192.png'

/** Render the Sterling rose brand mark from the supplied source artwork. */
export function SterlingMark({ size = 24, className }: IconProps) {
  return (
    <img
      src={sterlingRoseSource}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.2)),
        objectFit: 'cover',
      }}
    />
  )
}

/**
 * Render the Sterling Harness wordmark.
 * @param props.size - wordmark height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the decorative Sterling Harness wordmark.
 */
export function SterlingWordmark({ size = 24, className }: IconProps) {
  const badgeFontSize = Math.max(8, Math.round(size * 0.42))
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(4, Math.round(size * 0.25)),
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <SterlingMark size={size} />
      <span style={{ fontSize: size, fontWeight: 650, letterSpacing: 0 }}>Sterling</span>
      <span
        style={{
          padding: `${Math.max(1, Math.round(size * 0.08))}px ${Math.max(3, Math.round(size * 0.17))}px`,
          borderRadius: 2,
          background: 'var(--dsw-alias-label-primary)',
          color: 'var(--dsw-alias-label-primary-inverted)',
          fontSize: badgeFontSize,
          fontWeight: 700,
          letterSpacing: 0,
          lineHeight: 1.2,
        }}
      >
        HARNESS
      </span>
    </span>
  )
}
