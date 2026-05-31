/**
 * Lottie — anti-corruption layer over `lottie-react`.
 *
 * The ONLY module allowed to import `lottie-react` (engineering standard #7).
 * The library + animation JSON are loaded LAZILY via React.lazy + dynamic
 * import, so neither ships in the main bundle (engineering standard #5: fast).
 * Callers use <LottiePlayer animationData={...} /> and depend on our props,
 * not the library's API — swap the lib here only.
 *
 * Reduced motion is opt-in: pass `play={!usePrefersReducedMotion()}` (or render
 * a static fallback) at the call site, per the locked decision.
 */

import { Suspense, lazy } from 'react'

export interface LottiePlayerProps {
  /** Parsed Lottie JSON (import the .json lazily at the call site). */
  animationData: unknown
  loop?: boolean
  /** Whether the animation plays; set false to honor reduced-motion. */
  play?: boolean
  /** Fallback shown while the lottie-react chunk loads, or when not playing. */
  fallback?: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

// lottie-react is code-split into its own chunk — never in the main bundle.
const LazyLottie = lazy(async () => {
  // eslint-disable-next-line no-restricted-imports -- single allowed importer
  const mod = await import('lottie-react')
  return { default: mod.default }
})

export function LottiePlayer({
  animationData,
  loop = true,
  play = true,
  fallback = null,
  style,
  className,
}: LottiePlayerProps) {
  if (!play) return <>{fallback}</>
  return (
    <Suspense fallback={<>{fallback}</>}>
      <LazyLottie
        animationData={animationData}
        loop={loop}
        autoplay={play}
        style={style}
        className={className}
      />
    </Suspense>
  )
}
