/**
 * KnovexMark — the brand logo: a "K" built from a knowledge graph.
 *
 * Four concept-nodes at the vertices connected by edges that trace the letter K,
 * with a brighter hub node — ties to Knovex's concept-linking story. Single
 * source of truth for the mark (rail, chat avatar, welcome screen) so the brand
 * stays consistent (engineering standard #6).
 */

import { BRAND } from '@/theme/tokens'

export default function KnovexMark({ size = 22 }: { size?: number }) {
  // Unique gradient id per size avoids collisions when several marks render.
  const gid = `knx-grad-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={BRAND.copperLight} />
          <stop offset="100%" stopColor={BRAND.copperDark} />
        </linearGradient>
      </defs>
      {/* edges = the strokes of the K */}
      <g stroke={`url(#${gid})`} strokeWidth="2" strokeLinecap="round">
        <line x1="6.5" y1="4.5" x2="6.5" y2="19.5" />
        <line x1="6.5" y1="12" x2="16.5" y2="5" />
        <line x1="6.5" y1="12" x2="16.5" y2="19" />
      </g>
      {/* nodes = concepts at the vertices */}
      <g fill={`url(#${gid})`}>
        <circle cx="6.5" cy="4.5" r="2.3" />
        <circle cx="6.5" cy="19.5" r="2.3" />
        <circle cx="16.5" cy="5" r="2.3" />
        <circle cx="16.5" cy="19" r="2.3" />
      </g>
      {/* central hub node — the "spark", brighter */}
      <circle cx="6.5" cy="12" r="2.9" fill={BRAND.copperLight} />
    </svg>
  )
}
