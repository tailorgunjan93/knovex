import { describe, it, expect, beforeAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import ScenePlayer, { clampScene, sceneDurationMs } from '@/pages/Learn/ScenePlayer'
import type { AnimatedContent } from '@/api/learn.api'

// jsdom has no ResizeObserver — the stage measurement relies on it.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

const SAMPLE: AnimatedContent = {
  topic: 'Gravity',
  title: 'How gravity works',
  scenes: [
    {
      narration: 'Mass bends the space around it.',
      duration: 5,
      elements: [
        { type: 'text', text: 'Gravity', x: 50, y: 12, size: 'title', color: 'accent', enter: 'rise' },
        { type: 'circle', label: 'Sun', x: 50, y: 55, r: 12, color: 'amber', enter: 'pop' },
        { type: 'arrow', x1: 30, y1: 55, x2: 45, y2: 55, enter: 'draw' },
      ],
    },
    {
      narration: 'Objects follow that curve.',
      duration: 4,
      elements: [{ type: 'node', label: 'Planet', x: 50, y: 50, w: 24, h: 16, color: 'blue', enter: 'fade' }],
    },
  ],
}

describe('ScenePlayer render', () => {
  function renderPlayer(content = SAMPLE) {
    return render(
      <ThemeProvider theme={createTheme()}><ScenePlayer content={content} /></ThemeProvider>,
    )
  }

  it('renders the stage and the first scene', () => {
    renderPlayer()
    expect(screen.getByTestId('scene-stage')).toBeInTheDocument()
    expect(screen.getByText('Gravity')).toBeInTheDocument()        // title text element
    expect(screen.getByText('Sun')).toBeInTheDocument()            // circle label
    expect(screen.getByText('Mass bends the space around it.')).toBeInTheDocument() // narration
  })

  it('shows a scene counter and dots for every scene', () => {
    renderPlayer()
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('renders nothing when there are no scenes', () => {
    const { container } = renderPlayer({ topic: 't', title: 't', scenes: [] })
    expect(container.querySelector('[data-testid="scene-stage"]')).toBeNull()
  })
})

describe('ScenePlayer helpers', () => {
  describe('clampScene', () => {
    it('clamps into [0, total-1]', () => {
      expect(clampScene(-2, 5)).toBe(0)
      expect(clampScene(99, 5)).toBe(4)
      expect(clampScene(3, 5)).toBe(3)
    })
    it('returns 0 for empty', () => {
      expect(clampScene(2, 0)).toBe(0)
    })
  })

  describe('sceneDurationMs', () => {
    it('defaults missing/invalid to 5s', () => {
      expect(sceneDurationMs(undefined)).toBe(5000)
      expect(sceneDurationMs(0)).toBe(5000)
      expect(sceneDurationMs(-3)).toBe(5000)
    })
    it('clamps to 3..8 seconds', () => {
      expect(sceneDurationMs(1)).toBe(3000)
      expect(sceneDurationMs(5)).toBe(5000)
      expect(sceneDurationMs(20)).toBe(8000)
    })
  })
})
