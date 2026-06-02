/**
 * markText — wraps highlight matches in <mark> tints. Pure render logic, so it
 * is tested in isolation (no FileViewer mount).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { markText } from '../index'

function renderNode(node: React.ReactNode) {
  return render(<div data-testid="out">{node}</div>)
}

describe('markText', () => {
  it('returns the text unchanged when there are no marks', () => {
    expect(markText('hello world')).toBe('hello world')
    expect(markText('hello world', [])).toBe('hello world')
  })

  it('wraps a matching needle in a <mark> and preserves surrounding text', () => {
    const { getByTestId, container } = renderNode(
      markText('the weight matrix', [{ text: 'weight', color: 'yellow' }]),
    )
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('weight')
    expect(getByTestId('out').textContent).toBe('the weight matrix')
  })

  it('wraps every occurrence of a needle', () => {
    const { container } = renderNode(
      markText('cat and cat and cat', [{ text: 'cat', color: 'green' }]),
    )
    expect(container.querySelectorAll('mark')).toHaveLength(3)
  })

  it('ignores needles shorter than 2 chars and leaves text intact', () => {
    const { container, getByTestId } = renderNode(
      markText('a quick fox', [{ text: 'a', color: 'blue' }]),
    )
    expect(container.querySelectorAll('mark')).toHaveLength(0)
    expect(getByTestId('out').textContent).toBe('a quick fox')
  })

  it('applies multiple distinct highlights', () => {
    const { container, getByTestId } = renderNode(
      markText('alpha beta gamma', [
        { text: 'alpha', color: 'yellow' },
        { text: 'gamma', color: 'pink' },
      ]),
    )
    expect(container.querySelectorAll('mark')).toHaveLength(2)
    expect(getByTestId('out').textContent).toBe('alpha beta gamma')
  })
})
