/**
 * Review page — spaced-repetition return loop.
 *
 * Covers: empty "all caught up" state, rendering a due card, reveal → grade flow
 * (posts the rating to the right session/card), and draining the queue to the
 * caught-up state.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import ReviewPage from '../index'
import { learnApi, type DueReviewsResponse } from '@/api/learn.api'

vi.mock('@/api/learn.api', () => ({
  learnApi: {
    getDueReviews: vi.fn(),
    reviewFlashcard: vi.fn().mockResolvedValue({
      card_index: 0, ease_rating: 'good', next_review_at: '2026-06-10T00:00:00', interval_days: 1,
    }),
  },
}))

function due(cards: DueReviewsResponse['cards']): DueReviewsResponse {
  return { count: cards.length, cards }
}

const CARD = {
  session_id: 's1', card_index: 0, topic: 'Biology',
  front: 'What is ATP?', back: 'Energy currency of the cell', hint: 'energy',
  due_at: '2026-06-08T00:00:00', interval_days: 1, repetitions: 1,
}

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><ThemeProvider theme={createTheme()}>{children}</ThemeProvider></QueryClientProvider>
  )
  render(<ReviewPage />, { wrapper })
}

beforeEach(() => vi.clearAllMocks())

describe('Review page', () => {
  it('shows "all caught up" when nothing is due', async () => {
    vi.mocked(learnApi.getDueReviews).mockResolvedValue(due([]))
    renderPage()
    expect(await screen.findByTestId('review-empty')).toBeInTheDocument()
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('renders the front of a due card and hides the answer until revealed', async () => {
    vi.mocked(learnApi.getDueReviews).mockResolvedValue(due([CARD]))
    renderPage()
    expect(await screen.findByTestId('review-front')).toHaveTextContent('What is ATP?')
    expect(screen.queryByTestId('review-back')).not.toBeInTheDocument()
    expect(screen.getByTestId('review-progress')).toHaveTextContent('1 due')
  })

  it('reveals the answer + hint, then grades and advances', async () => {
    vi.mocked(learnApi.getDueReviews).mockResolvedValue(due([CARD]))
    renderPage()
    fireEvent.click(await screen.findByTestId('review-reveal'))

    expect(screen.getByTestId('review-back')).toHaveTextContent('Energy currency of the cell')
    expect(screen.getByText(/Hint: energy/i)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('rate-good'))
    await waitFor(() =>
      expect(learnApi.reviewFlashcard).toHaveBeenCalledWith('s1', 0, 'good'),
    )
    // Single-card queue → draining it lands on the caught-up state.
    expect(await screen.findByTestId('review-empty')).toBeInTheDocument()
  })

  it('advances through a multi-card queue one card at a time', async () => {
    const second = { ...CARD, session_id: 's2', front: 'What is DNA?', back: 'Genetic blueprint' }
    vi.mocked(learnApi.getDueReviews).mockResolvedValue(due([CARD, second]))
    renderPage()

    fireEvent.click(await screen.findByTestId('review-reveal'))
    fireEvent.click(screen.getByTestId('rate-again'))

    // Second card now showing (front again, answer hidden).
    expect(await screen.findByText('What is DNA?')).toBeInTheDocument()
    expect(screen.queryByTestId('review-back')).not.toBeInTheDocument()
    expect(learnApi.reviewFlashcard).toHaveBeenCalledWith('s1', 0, 'again')
  })
})
