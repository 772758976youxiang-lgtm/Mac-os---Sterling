import type { IconProps } from './icons/props.ts'

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
      <span style={{ fontSize: size, fontWeight: 650, letterSpacing: 0 }}>Sterling</span>
      <span
        style={{
          padding: `${Math.max(1, Math.round(size * 0.08))}px ${Math.max(3, Math.round(size * 0.17))}px`,
          borderRadius: 2,
          background: 'currentColor',
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
