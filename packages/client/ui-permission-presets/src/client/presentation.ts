/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/** Localized label for a shipped preset; unknown presets keep the transform. */
function shippedPresetLabel(value: string, t: (key: string) => string): string | undefined {
  if (value === FULL_ACCESS_PRESET) return t('permission.fullAccess')
  if (value === 'read-only') return t('permission.readOnly')
  if (value === 'workspace-write') return t('permission.workspaceWrite')
  return undefined
}

/**
 * Render a permission preset under its localized product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @param t - locale seat; when absent the shipped modes fall back to the
 *   conventional English labels (the settings store stays locale-agnostic).
 * @returns the localized shipped label, the Full access product label, or the
 *   conventional display name.
 */
export function displayPermissionPreset(value: string, name: string, t?: (key: string) => string): string {
  if (t !== undefined) {
    const localized = shippedPresetLabel(value, t)
    if (localized !== undefined) return localized
  }
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}
