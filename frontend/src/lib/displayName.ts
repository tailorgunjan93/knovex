/**
 * Display-name helpers — single source of truth for how the user's name and
 * avatar initials are derived. Fallback to "You" / "Y" so a fresh install never
 * shows a hardcoded personal name (fixes the "called Gunjan" bug at the root).
 */

/** The name to show in UI; empty/whitespace → "You". */
export function resolveDisplayName(name?: string | null): string {
  const n = (name ?? '').trim()
  return n.length > 0 ? n : 'You'
}

/** Avatar initials: "Ada Lovelace" → "AL", "Ada" → "AD", empty → "Y". */
export function initialsOf(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Y'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
