/**
 * RenderBlock tests
 *
 * Covers the six block types rendered by the FileViewer reading column:
 *   page      — HTML (is_html=true) vs plain-text (is_html=false) PDF rendering
 *   heading   — Typography with correct text
 *   paragraph — body text
 *   code      — monospace <pre>
 *   table_row — cells + column headers
 *   default   — fallback for unknown types
 *
 * HTML-vs-plain-text is the critical behaviour added in the PDF polish sprint:
 *   • is_html=true  → content injected via dangerouslySetInnerHTML; tags become
 *                     real DOM elements (h1–h4, p, img, strong, em …)
 *   • is_html=false → content rendered as literal text; "<h2>…</h2>" is visible
 *                     as a string, no h2 element is created
 */

import { type ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { describe, it, expect } from 'vitest'
import type { ContentBlock } from '@/api/reader.api'
import { RenderBlock } from '@/components/FileViewer'

// ─── Helper ────────────────────────────────────────────────────────────────────

const theme = createTheme()
function wrap(ui: ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

// ─── page block ───────────────────────────────────────────────────────────────

describe('RenderBlock › page block', () => {

  describe('HTML mode (is_html=true)', () => {
    it('parses heading tags into real DOM heading elements', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<h2>Section Title</h2><p>Body paragraph</p>',
        metadata: { page_num: 1, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Section Title')
    })

    it('renders paragraph content as a p element', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<p>Body paragraph</p>',
        metadata: { page_num: 1, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      const p = screen.getByText('Body paragraph')
      expect(p.tagName).toBe('P')
    })

    it('does NOT show raw "<h2>…</h2>" strings as visible text', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<h2>Section Title</h2>',
        metadata: { page_num: 1, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.queryByText('<h2>Section Title</h2>')).not.toBeInTheDocument()
    })

    it('renders base64 image as an img element inside figure', () => {
      const src = 'data:image/png;base64,abc123'
      const block: ContentBlock = {
        type: 'page',
        content: `<figure><img src="${src}" alt="image" /></figure>`,
        metadata: { page_num: 2, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      const img = screen.getByRole('img')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', src)
    })

    it('renders <strong> and <em> as inline mark elements', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<p><strong>Bold text</strong> and <em>italic text</em></p>',
        metadata: { page_num: 1, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.getByText('Bold text').tagName).toBe('STRONG')
      expect(screen.getByText('italic text').tagName).toBe('EM')
    })

    it('renders all heading levels h1–h4 as real heading elements', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4>',
        metadata: { page_num: 1, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('H1')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('H2')
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('H3')
      expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('H4')
    })

    it('renders a table with th/td cells', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<table><tr><th>Name</th><th>Score</th></tr><tr><td>Alice</td><td>95</td></tr></table>',
        metadata: { page_num: 1, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Score')).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('95')).toBeInTheDocument()
    })

    it('shows page number in the page header strip', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<p>Content</p>',
        metadata: { page_num: 7, is_html: true },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.getByText(/7.*Page/i)).toBeInTheDocument()
    })
  })

  describe('Plain-text mode (is_html=false)', () => {
    it('shows raw tag text — "<h2>…</h2>" is literal string', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<h2>This is plain text</h2>',
        metadata: { page_num: 1, is_html: false },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.getByText('<h2>This is plain text</h2>')).toBeInTheDocument()
    })

    it('does NOT create a heading element from raw tag text', () => {
      const block: ContentBlock = {
        type: 'page',
        content: '<h2>This is plain text</h2>',
        metadata: { page_num: 1, is_html: false },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    })

    it('shows page number in the page header strip', () => {
      const block: ContentBlock = {
        type: 'page',
        content: 'Just some plain text',
        metadata: { page_num: 3, is_html: false },
      }
      wrap(<RenderBlock block={block} />)

      expect(screen.getByText(/3.*Page/i)).toBeInTheDocument()
      expect(screen.getByText('Just some plain text')).toBeInTheDocument()
    })

    it('treats missing is_html as plain text (safe default)', () => {
      // metadata.is_html is undefined — must NOT inject HTML
      const block: ContentBlock = {
        type: 'page',
        content: '<script>alert(1)</script>',
        metadata: { page_num: 1 },
      }
      wrap(<RenderBlock block={block} />)

      // The raw string should be visible as text, not executed as HTML
      expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    })
  })
})

// ─── heading block ────────────────────────────────────────────────────────────

describe('RenderBlock › heading block', () => {
  it('renders heading text', () => {
    const block: ContentBlock = { type: 'heading', content: 'Chapter One', level: 1 }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('Chapter One')).toBeInTheDocument()
  })

  it('renders heading at level 2', () => {
    const block: ContentBlock = { type: 'heading', content: 'Methods', level: 2 }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('Methods')).toBeInTheDocument()
  })

  it('defaults to level 2 when no level is provided', () => {
    const block: ContentBlock = { type: 'heading', content: 'No Level' }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('No Level')).toBeInTheDocument()
  })
})

// ─── paragraph block ──────────────────────────────────────────────────────────

describe('RenderBlock › paragraph block', () => {
  it('renders text content', () => {
    const block: ContentBlock = { type: 'paragraph', content: 'Hello world.' }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('Hello world.')).toBeInTheDocument()
  })

  it('does not inject HTML from paragraph content', () => {
    const block: ContentBlock = { type: 'paragraph', content: '<strong>not bold</strong>' }
    wrap(<RenderBlock block={block} />)
    // Typography renders as text — <strong> not injected
    expect(screen.getByText('<strong>not bold</strong>')).toBeInTheDocument()
    expect(screen.queryByText('not bold')).not.toBeInTheDocument()
  })
})

// ─── code block ───────────────────────────────────────────────────────────────

describe('RenderBlock › code block', () => {
  it('renders code inside a pre element', () => {
    const block: ContentBlock = { type: 'code', content: 'const x = 1;' }
    wrap(<RenderBlock block={block} />)
    const pre = screen.getByText('const x = 1;').closest('pre')
    expect(pre).not.toBeNull()
  })

  it('preserves multi-line code', () => {
    const block: ContentBlock = { type: 'code', content: 'line1\nline2\nline3' }
    const { container } = wrap(<RenderBlock block={block} />)
    // getByText normalises newlines — query the pre element directly instead
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.textContent).toBe('line1\nline2\nline3')
  })
})

// ─── table_row block ──────────────────────────────────────────────────────────

describe('RenderBlock › table_row block', () => {
  it('renders cell values', () => {
    const block: ContentBlock = {
      type: 'table_row',
      content: ['Alice', '30', 'Engineer'],
      metadata: { headers: ['Name', 'Age', 'Role'] },
    }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('Engineer')).toBeInTheDocument()
  })

  it('renders column header labels', () => {
    const block: ContentBlock = {
      type: 'table_row',
      content: ['Alice', '30'],
      metadata: { headers: ['Name', 'Age'] },
    }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Age')).toBeInTheDocument()
  })

  it('renders without headers when metadata is absent', () => {
    const block: ContentBlock = {
      type: 'table_row',
      content: ['foo', 'bar'],
    }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('foo')).toBeInTheDocument()
    expect(screen.getByText('bar')).toBeInTheDocument()
  })
})

// ─── default / unknown block ──────────────────────────────────────────────────

describe('RenderBlock › unknown block type', () => {
  it('renders content as plain text fallback', () => {
    const block: ContentBlock = { type: 'unknown_type', content: 'fallback text' }
    wrap(<RenderBlock block={block} />)
    expect(screen.getByText('fallback text')).toBeInTheDocument()
  })
})
