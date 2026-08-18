import type { IconProps } from './icons/props.ts'

/**
 * Render the Sterling application mark from the public Web asset.
 * @param props.size - mark width and height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the decorative Sterling mark image.
 */
export function SterlingMark({ size = 24, className }: IconProps) {
  return (
    <img
      src="/sterling-icon.png"
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        display: 'block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: Math.max(2, Math.round(size * 0.16)),
        objectFit: 'cover',
      }}
    />
  )
}
