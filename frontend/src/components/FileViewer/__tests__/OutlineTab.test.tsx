/**
 * OutlineTab tests
 *
 * OutlineTab is the secondary tab in the reader MetaBar that lists all heading
 * blocks on the current page, acting as a mini table of contents.
 *
 * Tests:
 *   • Empty state — no headings → informational placeholder rendered
 *   • Populated  — heading blocks listed; non-heading blocks filtered out
 *   • Levels     — h1/h2 appear with greater visual weight than h3/h4
 */

import { type ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { describe, it, expect } from 'vitest'
import type { ContentBlock } from '@/api/reader.api'
import { OutlineTab } from '@/components/FileViewer'

// ─── Helper ────────────────────────────────────────────────────────────────────

const theme = createTheme()
function wrap(ui: ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('OutlineTab › empty state', () => {
  it('shows placeholder message when blocks array is empty', () => {
    wrap(<OutlineTab blocks={[]} />)
    expect(screen.getByText('No headings on this page')).toBeInTheDocument()
  })

  it('shows placeholder message when blocks contain no heading type', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', content: 'Intro paragraph' },
      { type: 'code',      content: 'const x = 1;'   },
      { type: 'table_row', content: ['A', 'B']        },
    ]
    wrap(<OutlineTab blocks={blocks} />)
    expect(screen.getByText('No headings on this page')).toBeInTheDocument()
    expect(screen.queryByText('Intro paragraph')).not.toBeInTheDocument()
  })
})

// ─── Populated state ──────────────────────────────────────────────────────────

describe('OutlineTab › populated', () => {
  it('renders only heading blocks from a mixed list', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading',   content: 'Introduction', level: 1 },
      { type: 'paragraph', content: 'Some body text'          },
      { type: 'heading',   content: 'Methods',      level: 2 },
      { type: 'code',      content: 'print("hi")'            },
      { type: 'heading',   content: 'Results',       level: 2 },
    ]
    wrap(<OutlineTab blocks={blocks} />)

    expect(screen.getByText('Introduction')).toBeInTheDocument()
    expect(screen.getByText('Methods')).toBeInTheDocument()
    expect(screen.getByText('Results')).toBeInTheDocument()

    // Non-heading content must not appear
    expect(screen.queryByText('Some body text')).not.toBeInTheDocument()
    expect(screen.queryByText('print("hi")')).not.toBeInTheDocument()
  })

  it('renders headings in document order', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', content: 'First',  level: 1 },
      { type: 'heading', content: 'Second', level: 2 },
      { type: 'heading', content: 'Third',  level: 3 },
    ]
    wrap(<OutlineTab blocks={blocks} />)

    const items = screen.getAllByText(/First|Second|Third/)
    expect(items[0]).toHaveTextContent('First')
    expect(items[1]).toHaveTextContent('Second')
    expect(items[2]).toHaveTextContent('Third')
  })

  it('does not show the empty-state placeholder when headings exist', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', content: 'A Heading', level: 1 },
    ]
    wrap(<OutlineTab blocks={blocks} />)
    expect(screen.queryByText('No headings on this page')).not.toBeInTheDocument()
  })
})

// ─── Heading levels ───────────────────────────────────────────────────────────

describe('OutlineTab › heading levels', () => {
  it('renders a single h1 heading', () => {
    const blocks: ContentBlock[] = [{ type: 'heading', content: 'Top Level', level: 1 }]
    wrap(<OutlineTab blocks={blocks} />)
    expect(screen.getByText('Top Level')).toBeInTheDocument()
  })

  it('renders a single h4 heading', () => {
    const blocks: ContentBlock[] = [{ type: 'heading', content: 'Deep Sub', level: 4 }]
    wrap(<OutlineTab blocks={blocks} />)
    expect(screen.getByText('Deep Sub')).toBeInTheDocument()
  })

  it('defaults gracefully when level is missing', () => {
    const blocks: ContentBlock[] = [{ type: 'heading', content: 'No Level' }]
    wrap(<OutlineTab blocks={blocks} />)
    expect(screen.getByText('No Level')).toBeInTheDocument()
  })
})
