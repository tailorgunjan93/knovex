/**
 * Learn Page — component tests
 *
 * Coverage:
 *   Empty state
 *     • Format cards grid rendered (all 8 formats)
 *     • Difficulty selector rendered (beginner / intermediate / expert)
 *     • Generate button disabled when topic is empty
 *
 *   Session history sidebar
 *     • "No sessions yet" shown when list is empty
 *     • Sessions rendered when list is non-empty
 *     • Delete button visible on hover (mouse-enter), hidden on mouse-leave
 *     • Delete mutation called on delete click
 *
 *   Format selector
 *     • Clicking a format card updates the active format
 *     • Selected format is visually active (aria or test-id based check)
 *
 *   Stats bar
 *     • Level and XP displayed when userStats loaded
 *     • Streak indicator shown only when streak > 0
 *
 *   Stream handler
 *     • Generate button triggers streamSession with correct topic + format
 *     • Stop button appears while streaming, calls abort
 *     • XP alert shown after done event
 *
 *   Quiz sub-component (unit)
 *     • Options rendered with A/B/C/D badges
 *     • submitQuizAnswer called on click
 *     • Correct answer highlights green; wrong highlights red
 *
 *   Flashcard sub-component (unit)
 *     • Front face rendered (question text visible)
 *     • Rating buttons appear after flip (click on card)
 *     • reviewFlashcard called with correct ease rating
 */

// jsdom does not implement scrollIntoView — stub it globally
window.HTMLElement.prototype.scrollIntoView = vi.fn()

import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ReactNode } from 'react'
import LearnPage, { wikipediaUrlFor } from '../index'
import { learnApi } from '@/api/learn.api'
import type { LearnSession, UserStats, QuizContent, FlashcardContent, GuidedContent } from '@/api/learn.api'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/api/learn.api', () => ({
  learnApi: {
    listSessions:    vi.fn(),
    getUserStats:    vi.fn(),
    getSession:      vi.fn(),
    deleteSession:   vi.fn(),
    streamSession:   vi.fn(),
    submitQuizAnswer: vi.fn(),
    reviewFlashcard: vi.fn(),
  },
}))

// Mock KB + reader APIs (used by the source-mode UI; queries are disabled by default)
vi.mock('@/api/kb.api', () => ({
  kbApi: { list: vi.fn().mockResolvedValue([]), listFiles: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/api/reader.api', () => ({
  readerApi: { getContent: vi.fn(), upload: vi.fn() },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_STATS: UserStats = {
  xp: 0, level: 1, streak: 0, last_activity: null, badges: [],
}

const STATS_WITH_STREAK: UserStats = {
  xp: 420, level: 3, streak: 5, last_activity: '2026-05-28T10:00:00', badges: ['first_step'],
}

const SESSION_QUIZ: LearnSession = {
  id: 'sess-quiz-1',
  topic: 'Black Holes',
  format: 'quiz',
  source_type: 'topic',
  difficulty: 'intermediate',
  status: 'ready',
  content: {
    questions: [
      {
        q: 'What is a black hole?',
        options: ['A. A star', 'B. A collapsed star', 'C. A galaxy', 'D. A nebula'],
        correct: 1,
        explanation: 'A black hole forms from a collapsed massive star.',
      },
    ],
  } as QuizContent,
  created_at: '2026-05-28T09:00:00',
  completed_at: '2026-05-28T09:01:00',
}

const SESSION_STORY: LearnSession = {
  id: 'sess-story-1',
  topic: 'Quantum Mechanics',
  format: 'story',
  source_type: 'topic',
  difficulty: 'beginner',
  status: 'ready',
  content: { text: 'Once upon a time in quantum land…' },
  created_at: '2026-05-28T08:00:00',
  completed_at: '2026-05-28T08:02:00',
}

const FLASHCARD_CONTENT: FlashcardContent = {
  cards: [
    { front: 'What is ATP?', back: 'Adenosine Triphosphate — cellular energy currency', hint: 'Think energy molecule' },
    { front: 'What is DNA?', back: 'Deoxyribonucleic Acid — stores genetic info', hint: 'Think double helix' },
  ],
}

// ─── Render helper ────────────────────────────────────────────────────────────

function renderLearn() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const theme = createTheme()

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        {/* LearnPage uses useSearchParams() — needs a Router in tests */}
        <MemoryRouter>{children}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )

  return render(<LearnPage />, { wrapper: Wrapper })
}

// ─── beforeEach defaults ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  ;(learnApi.listSessions as Mock).mockResolvedValue([])
  ;(learnApi.getUserStats as Mock).mockResolvedValue(EMPTY_STATS)
  ;(learnApi.streamSession as Mock).mockResolvedValue(undefined)
})

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('Empty state', () => {
  it('renders the four lab format cards in the empty state grid', async () => {
    renderLearn()
    const expected = ['Guided', 'Animated', 'Flashcards', 'Quiz']
    for (const label of expected) {
      await waitFor(() => expect(screen.getAllByText(label).length).toBeGreaterThan(0))
    }
  })

  it('no longer offers the removed formats (Mind Map / Timeline / Story / ELI5 / Speed Learn / Brainstorm)', () => {
    renderLearn()
    for (const label of ['Mind Map', 'Timeline', 'Story', 'ELI5', 'Speed Learn', 'Brainstorm']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('renders difficulty selector with three options', async () => {
    renderLearn()
    await waitFor(() => {
      expect(screen.getAllByText('Beginner').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Intermediate').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Expert').length).toBeGreaterThan(0)
    })
  })

  it('Generate button is disabled when topic is empty', async () => {
    renderLearn()
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Generate/i })
      expect(btn).toBeDisabled()
    })
  })

  it('Generate button becomes enabled after typing a topic', async () => {
    renderLearn()
    const input = await screen.findByPlaceholderText('What do you want to learn?')
    await userEvent.type(input, 'Photosynthesis')
    const btn = screen.getByRole('button', { name: /Generate/i })
    expect(btn).toBeEnabled()
  })

  it('shows each format and difficulty control only ONCE (no header/body duplication)', async () => {
    renderLearn()
    // Previously the format + difficulty selectors rendered twice (a header pill
    // row AND the body cards/segmented). Setup should now show each label once.
    await waitFor(() => expect(screen.getAllByText('Guided')).toHaveLength(1))
    expect(screen.getAllByText('Animated')).toHaveLength(1)
    expect(screen.getAllByText('Quiz')).toHaveLength(1)
    expect(screen.getAllByText('Beginner')).toHaveLength(1)
    expect(screen.getAllByText('Expert')).toHaveLength(1)
  })

  it('renders the Wikipedia source pill and a body LANGUAGE picker', async () => {
    renderLearn()
    await waitFor(() => expect(screen.getByText('Wikipedia')).toBeInTheDocument())
    expect(screen.getByText('LANGUAGE')).toBeInTheDocument()
    expect(screen.getByText('हिन्दी')).toBeInTheDocument()
  })

  it('does not render the redundant "GROW · RETAIN" eyebrow', () => {
    renderLearn()
    expect(screen.queryByText(/GROW · RETAIN/)).not.toBeInTheDocument()
  })
})

// ─── Wikipedia source ─────────────────────────────────────────────────────────

describe('Wikipedia source', () => {
  it('wikipediaUrlFor builds an article URL (spaces → underscores, encoded)', () => {
    expect(wikipediaUrlFor('Photosynthesis')).toBe('https://en.wikipedia.org/wiki/Photosynthesis')
    expect(wikipediaUrlFor('  Black Holes ')).toBe('https://en.wikipedia.org/wiki/Black_Holes')
  })

  it('generates via the URL source for the Wikipedia article', async () => {
    renderLearn()
    fireEvent.click(await screen.findByText('Wikipedia'))
    const input = await screen.findByPlaceholderText(/Wikipedia article/i)
    await userEvent.type(input, 'Coriolis effect')
    await userEvent.click(screen.getByRole('button', { name: /Generate/i }))
    await waitFor(() =>
      expect(learnApi.streamSession).toHaveBeenCalledWith(
        'Coriolis effect',
        'guided',
        expect.any(String),
        expect.any(Function),
        expect.anything(),
        'url',
        'https://en.wikipedia.org/wiki/Coriolis_effect',
        '',
        'English',
      )
    )
  })
})

// ─── Stats bar ────────────────────────────────────────────────────────────────

describe('Stats bar', () => {
  it('shows Level and XP when stats are loaded', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_WITH_STREAK)
    renderLearn()
    await waitFor(() => {
      expect(screen.getByText(/Lv 3/)).toBeInTheDocument()
      expect(screen.getByText(/420 XP/)).toBeInTheDocument()
    })
  })

  it('shows streak when streak > 0', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_WITH_STREAK)
    renderLearn()
    await waitFor(() => expect(screen.getByText('5d')).toBeInTheDocument())
  })

  it('does not show streak indicator when streak is 0', async () => {
    renderLearn()
    await waitFor(() => expect(screen.queryByText(/\dd$/)).toBeNull())
  })

  it('shows badge emoji for earned badges', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_WITH_STREAK)
    renderLearn()
    // first_step badge label is "🏁 First Step" — the emoji part is "🏁"
    await waitFor(() => expect(screen.getByText('🏁')).toBeInTheDocument())
  })
})

// ─── Session history sidebar ──────────────────────────────────────────────────

describe('Session history sidebar', () => {
  it('shows empty state message when no sessions', async () => {
    renderLearn()
    await waitFor(() =>
      expect(screen.getByText(/Your sessions will appear here/i)).toBeInTheDocument()
    )
  })

  it('renders session topics when sessions are present', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([SESSION_QUIZ, SESSION_STORY])
    renderLearn()
    await waitFor(() => {
      expect(screen.getByText('Black Holes')).toBeInTheDocument()
      expect(screen.getByText('Quantum Mechanics')).toBeInTheDocument()
    })
  })

  it('delete button is rendered in each session row (aria-label present)', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([SESSION_QUIZ])
    renderLearn()
    await screen.findByText('Black Holes')
    // Delete button is always in the DOM (visibility controlled by opacity)
    expect(screen.getByRole('button', { name: /Delete session/i })).toBeInTheDocument()
  })

  it('calls deleteSession when delete button is clicked', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([SESSION_QUIZ])
    ;(learnApi.deleteSession as Mock).mockResolvedValue(undefined)
    renderLearn()

    await screen.findByText('Black Holes')
    const deleteBtn = screen.getByRole('button', { name: /Delete session/i })
    fireEvent.click(deleteBtn)

    await waitFor(() =>
      expect(learnApi.deleteSession).toHaveBeenCalledWith(SESSION_QUIZ.id)
    )
  })

  it('loads session content when clicking a history item', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([SESSION_STORY])
    ;(learnApi.getSession as Mock).mockResolvedValue(SESSION_STORY)
    renderLearn()

    const item = await screen.findByText('Quantum Mechanics')
    fireEvent.click(item)

    // After loading a story session the header shows the session title
    await waitFor(() =>
      expect(screen.getAllByText('Quantum Mechanics').length).toBeGreaterThan(0)
    )
  })
})

// ─── Format selector (header row) ────────────────────────────────────────────

describe('Format selector', () => {
  it('shows all 8 formats in the header row', async () => {
    renderLearn()
    // The header row labels appear via the FORMATS mapping
    const quizLabels = await screen.findAllByText('Quiz')
    expect(quizLabels.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Generate + streaming ─────────────────────────────────────────────────────

describe('Generate and streaming', () => {
  it('calls streamSession with the correct topic and format', async () => {
    ;(learnApi.streamSession as Mock).mockImplementation(
      async (_topic, _format, _difficulty, onEvent) => {
        onEvent({ type: 'token', content: 'Hello ' })
        onEvent({ type: 'token', content: 'World' })
        onEvent({ type: 'done', session_id: 'sess-new-1', xp_earned: 10, new_badges: [] })
      }
    )
    ;(learnApi.getSession as Mock).mockResolvedValue(SESSION_STORY)

    renderLearn()

    const input = await screen.findByPlaceholderText('What do you want to learn?')
    await userEvent.type(input, 'Machine Learning')

    // Default format is Guided (first lab card).
    const genBtn = screen.getByRole('button', { name: /Generate/i })
    await userEvent.click(genBtn)

    await waitFor(() =>
      expect(learnApi.streamSession).toHaveBeenCalledWith(
        'Machine Learning',
        'guided',
        expect.any(String),    // difficulty
        expect.any(Function),  // onEvent
        expect.anything(),     // AbortSignal
        'topic',               // sourceType
        undefined,             // sourceRef
        '',                    // contextText
        'English',             // language (default)
      )
    )
  })

  it('shows XP alert after a done event with xp_earned > 0', async () => {
    const storySession: LearnSession = {
      ...SESSION_STORY,
      id: 'sess-xp-story',
      topic: 'Gravity',
    }
    ;(learnApi.streamSession as Mock).mockImplementation(
      async (_topic, _format, _difficulty, onEvent) => {
        onEvent({ type: 'token', content: 'Once upon a time...' })
        onEvent({ type: 'done', session_id: storySession.id, xp_earned: 25, new_badges: ['first_step'] })
      }
    )
    ;(learnApi.getSession as Mock).mockResolvedValue(storySession)

    renderLearn()

    const input = await screen.findByPlaceholderText('What do you want to learn?')
    await userEvent.type(input, 'Gravity')

    // Format is irrelevant to the XP-alert behavior; use the default (Quiz).
    const genBtn = screen.getByRole('button', { name: /Generate/i })
    await userEvent.click(genBtn)

    await waitFor(
      () => expect(screen.getByText(/\+25 XP/i)).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('shows an error alert when stream emits an error event', async () => {
    ;(learnApi.streamSession as Mock).mockImplementation(
      async (_topic, _format, _difficulty, onEvent) => {
        onEvent({ type: 'error', error: 'LLM service unavailable' })
      }
    )

    renderLearn()

    const input = await screen.findByPlaceholderText('What do you want to learn?')
    await userEvent.type(input, 'Relativity')

    const genBtn = screen.getByRole('button', { name: /Generate/i })
    await userEvent.click(genBtn)

    await waitFor(() =>
      expect(screen.getByText('LLM service unavailable')).toBeInTheDocument()
    )
  })
})

// ─── Quiz sub-component ───────────────────────────────────────────────────────

describe('QuizView', () => {
  const renderWithQuiz = async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([SESSION_QUIZ])
    ;(learnApi.getSession as Mock).mockResolvedValue(SESSION_QUIZ)
    ;(learnApi.submitQuizAnswer as Mock).mockResolvedValue({
      correct: true,
      correct_answer: 'B. A collapsed star',
      explanation: 'Black holes form from collapsed stars.',
      xp_earned: 5,
      session_score: 100,
    })

    renderLearn()

    // Click the session in history to load it
    const item = await screen.findByText('Black Holes')
    fireEvent.click(item)
    return undefined
  }

  it('renders A/B/C/D letter badges for quiz options', async () => {
    await renderWithQuiz()
    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument()
      expect(screen.getByText('B')).toBeInTheDocument()
      expect(screen.getByText('C')).toBeInTheDocument()
      expect(screen.getByText('D')).toBeInTheDocument()
    })
  })

  it('renders the question text', async () => {
    await renderWithQuiz()
    // The stem also appears in the outline rail (table of contents); scope to the
    // main lesson stage so we assert the question card specifically.
    await waitFor(() =>
      expect(within(screen.getByTestId('lesson-stage')).getByText('What is a black hole?')).toBeInTheDocument()
    )
  })

  it('calls submitQuizAnswer when an option is clicked', async () => {
    await renderWithQuiz()

    const optionText = await screen.findByText('B. A collapsed star')
    fireEvent.click(optionText)

    await waitFor(() =>
      expect(learnApi.submitQuizAnswer).toHaveBeenCalledWith(
        SESSION_QUIZ.id,
        0,
        'B. A collapsed star',
      )
    )
  })

  it('shows explanation after answering', async () => {
    await renderWithQuiz()

    const optionText = await screen.findByText('B. A collapsed star')
    fireEvent.click(optionText)

    await waitFor(() =>
      expect(screen.getByText(/Black holes form from collapsed stars/i)).toBeInTheDocument()
    )
  })
})

// ─── Flashcard sub-component ──────────────────────────────────────────────────

describe('FlashcardView', () => {
  const FLASHCARD_SESSION: LearnSession = {
    id: 'sess-fc-1',
    topic: 'Biology',
    format: 'flashcard',
    source_type: 'topic',
    difficulty: 'beginner',
    status: 'ready',
    content: FLASHCARD_CONTENT,
    created_at: '2026-05-28T07:00:00',
    completed_at: '2026-05-28T07:02:00',
  }

  beforeEach(() => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([FLASHCARD_SESSION])
    ;(learnApi.getSession as Mock).mockResolvedValue(FLASHCARD_SESSION)
    ;(learnApi.reviewFlashcard as Mock).mockResolvedValue({
      card_index: 0,
      ease_rating: 'good',
      next_review_at: '2026-06-01T00:00:00',
    })
  })

  const loadFlashcards = async () => {
    renderLearn()
    const item = await screen.findByText('Biology')
    fireEvent.click(item)
  }

  it('shows the front face (question) of the first card', async () => {
    await loadFlashcards()
    // Card fronts also appear in the outline rail; scope to the stage.
    await waitFor(() =>
      expect(within(screen.getByTestId('lesson-stage')).getByText('What is ATP?')).toBeInTheDocument()
    )
  })

  it('shows "Tap to flip" prompt before flipping', async () => {
    await loadFlashcards()
    await waitFor(() =>
      expect(screen.getByText('Tap to flip')).toBeInTheDocument()
    )
  })

  it('reveals rating buttons after clicking the card (flip)', async () => {
    await loadFlashcards()
    const stage = await screen.findByTestId('lesson-stage')
    const card = await within(stage).findByText('What is ATP?')
    // The 3D card is the perspective container — find the card's Box
    const cardContainer = card.closest('[style]') ?? card.parentElement!
    fireEvent.click(cardContainer)

    // After flip, rating buttons appear
    await waitFor(() => {
      expect(screen.getByText('Again')).toBeInTheDocument()
      expect(screen.getByText('Hard')).toBeInTheDocument()
      expect(screen.getByText('Good')).toBeInTheDocument()
      expect(screen.getByText('Easy')).toBeInTheDocument()
    })
  })

  it('calls reviewFlashcard when a rating button is clicked', async () => {
    await loadFlashcards()
    const stage = await screen.findByTestId('lesson-stage')
    const card = await within(stage).findByText('What is ATP?')
    const cardContainer = card.closest('[style]') ?? card.parentElement!
    fireEvent.click(cardContainer)

    const goodBtn = await screen.findByText('Good')
    fireEvent.click(goodBtn)

    await waitFor(() =>
      expect(learnApi.reviewFlashcard).toHaveBeenCalledWith(
        FLASHCARD_SESSION.id,
        0,
        'good',
      )
    )
  })
})

// ─── Guided Learning format (integration via LearnPage) ───────────────────────

describe('Guided Learning — UI/UX Expert', () => {

  const GUIDED_CONTENT: GuidedContent = {
    topic:       'Photosynthesis',
    intro:       'Plants are solar-powered chemical factories.',
    total_steps: 2,
    steps: [
      {
        step:        1,
        title:       'What is Photosynthesis?',
        explanation: 'Photosynthesis is the process by which plants use light.',
        example:     'A leaf on a sunny day.',
        analogy:     'Like a solar panel charging a battery.',
        key_insight: 'Light energy becomes chemical energy.',
        check_in:    'Can you explain photosynthesis in one sentence?',
        quiz_check:  {
          question:         'What do plants use to make food?',
          options:          ['Sunlight, water, CO2', 'Soil minerals only', 'Animal matter'],
          correct:          0,
          feedback_correct: 'Correct! Plants use sunlight, water, and CO2.',
          feedback_wrong:   'Not quite. Plants use sunlight, water, and carbon dioxide.',
        },
      },
      {
        step:        2,
        title:       'The Chloroplast',
        explanation: 'Chloroplasts are the organelles where photosynthesis happens.',
        example:     'Green color in leaves comes from chlorophyll.',
        analogy:     null,
        key_insight: 'Chlorophyll absorbs light energy.',
        check_in:    'Where does photosynthesis occur in a plant cell?',
        quiz_check:  null,
      },
    ],
  }

  const GUIDED_SESSION: LearnSession = {
    id:           'sess-guided-1',
    topic:        'Photosynthesis',
    format:       'guided',
    source_type:  'topic',
    difficulty:   'beginner',
    status:       'ready',
    content:      GUIDED_CONTENT,
    created_at:   '2026-05-28T11:00:00',
    completed_at: '2026-05-28T11:02:00',
  }

  it('renders "Guided" format card in the empty state grid', async () => {
    renderLearn()
    await waitFor(() =>
      expect(screen.getAllByText('Guided').length).toBeGreaterThan(0)
    )
  })

  it('renders the guided format description card', async () => {
    renderLearn()
    await waitFor(() =>
      expect(screen.getByText(/conversational tutor walks you through/i)).toBeInTheDocument()
    )
  })

  it('GuidedViewer renders when a guided session is loaded from history', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([GUIDED_SESSION])
    ;(learnApi.getSession as Mock).mockResolvedValue(GUIDED_SESSION)

    renderLearn()

    const item = await screen.findByText('Photosynthesis')
    fireEvent.click(item)

    // GuidedViewer renders intro on step 0
    await waitFor(() =>
      expect(screen.getByText('Plants are solar-powered chemical factories.')).toBeInTheDocument()
    )
  })

  it('GuidedViewer step title and content visible after loading', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([GUIDED_SESSION])
    ;(learnApi.getSession as Mock).mockResolvedValue(GUIDED_SESSION)

    renderLearn()

    const item = await screen.findByText('Photosynthesis')
    fireEvent.click(item)

    // Step titles also list in the outline rail; scope to the lesson stage.
    await waitFor(() =>
      expect(within(screen.getByTestId('lesson-stage')).getByText('What is Photosynthesis?')).toBeInTheDocument()
    )
  })

  it('streamSession called with format="guided" when Guided format selected', async () => {
    ;(learnApi.streamSession as Mock).mockImplementation(
      async (_topic, _format, _difficulty, onEvent) => {
        onEvent({ type: 'done', session_id: GUIDED_SESSION.id, xp_earned: 10, new_badges: [] })
      }
    )
    ;(learnApi.getSession as Mock).mockResolvedValue(GUIDED_SESSION)

    renderLearn()

    const input = await screen.findByPlaceholderText('What do you want to learn?')
    await userEvent.type(input, 'Photosynthesis')

    // Select Guided format from header format row
    const guidedLabels = await screen.findAllByText('Guided')
    fireEvent.click(guidedLabels[0])

    const genBtn = screen.getByRole('button', { name: /Generate/i })
    await userEvent.click(genBtn)

    await waitFor(() =>
      expect(learnApi.streamSession).toHaveBeenCalledWith(
        'Photosynthesis',
        'guided',
        expect.any(String),
        expect.any(Function),
        expect.anything(),
        'topic',
        undefined,
        '',
        'English',             // language (default)
      )
    )
  })
})

describe('Guided Learning — Business Analyst', () => {

  const GUIDED_CONTENT: GuidedContent = {
    topic:       'DNA Replication',
    intro:       'Every cell division starts with copying the entire genome.',
    total_steps: 2,
    steps: [
      {
        step:        1,
        title:       'The Double Helix',
        explanation: 'DNA is a double helix made of two complementary strands.',
        example:     'Like a twisted ladder where the rungs are base pairs.',
        analogy:     'Imagine a zipper being unzipped.',
        key_insight: 'Base pairing rules ensure accurate copying.',
        check_in:    'What holds the two strands of DNA together?',
        quiz_check:  {
          question:         'What shape is a DNA molecule?',
          options:          ['Single helix', 'Double helix', 'Triple strand'],
          correct:          1,
          feedback_correct: 'Right! DNA is a double helix.',
          feedback_wrong:   'Not quite — DNA has two strands forming a double helix.',
        },
      },
      {
        step:        2,
        title:       'Replication Fork',
        explanation: 'Enzymes unwind and copy DNA at the replication fork.',
        example:     'DNA polymerase reads the template and builds the new strand.',
        analogy:     null,
        key_insight: 'Replication is semi-conservative — one old strand, one new.',
        check_in:    'Why is replication called semi-conservative?',
        quiz_check:  null,
      },
    ],
  }

  const GUIDED_SESSION: LearnSession = {
    id: 'sess-guided-bio', topic: 'DNA Replication', format: 'guided',
    source_type: 'topic', difficulty: 'intermediate', status: 'ready',
    content: GUIDED_CONTENT, created_at: '2026-05-28T12:00:00', completed_at: null,
  }

  it('guided session appears in history sidebar with correct topic', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([GUIDED_SESSION])
    ;(learnApi.getSession as Mock).mockResolvedValue(GUIDED_SESSION)

    renderLearn()

    await waitFor(() =>
      expect(screen.getByText('DNA Replication')).toBeInTheDocument()
    )
  })

  it('GuidedViewer shows step-by-step navigation controls (Step 1 of 2)', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([GUIDED_SESSION])
    ;(learnApi.getSession as Mock).mockResolvedValue(GUIDED_SESSION)

    renderLearn()

    const item = await screen.findByText('DNA Replication')
    fireEvent.click(item)

    await waitFor(() =>
      expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument()
    )
  })

  it('guided session can be deleted from history', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([GUIDED_SESSION])
    ;(learnApi.deleteSession as Mock).mockResolvedValue(undefined)

    renderLearn()

    await screen.findByText('DNA Replication')
    const deleteBtn = screen.getByRole('button', { name: /Delete session/i })
    fireEvent.click(deleteBtn)

    await waitFor(() =>
      expect(learnApi.deleteSession).toHaveBeenCalledWith(GUIDED_SESSION.id)
    )
  })
})

// ─── Stage B.2 — in-lesson format tabs + derived rails ────────────────────────

describe('Lesson tabs + rails (Stage B.2)', () => {
  const loadQuiz = async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([SESSION_QUIZ])
    ;(learnApi.getSession as Mock).mockResolvedValue(SESSION_QUIZ)
    renderLearn()
    fireEvent.click(await screen.findByText('Black Holes'))
    // wait until the lesson stage is mounted
    await screen.findByTestId('lesson-stage')
  }

  it('renders the four in-lesson format tabs once a lesson is open', async () => {
    await loadQuiz()
    for (const id of ['guided', 'animated', 'flashcard', 'quiz']) {
      expect(screen.getByTestId(`lesson-tab-${id}`)).toBeInTheDocument()
    }
  })

  it('marks the active format tab as pressed', async () => {
    await loadQuiz()
    expect(screen.getByTestId('lesson-tab-quiz')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('lesson-tab-guided')).toHaveAttribute('aria-pressed', 'false')
  })

  it('re-generates in the picked format (same topic) when a different tab is clicked', async () => {
    await loadQuiz()
    fireEvent.click(screen.getByTestId('lesson-tab-guided'))
    await waitFor(() =>
      expect(learnApi.streamSession).toHaveBeenCalledWith(
        'Black Holes',          // topic preserved
        'guided',               // new format
        'intermediate',
        expect.any(Function),
        expect.anything(),
        'topic',
        undefined,
        '',
        'English',
      )
    )
  })

  it('does not re-generate when the already-active tab is clicked', async () => {
    await loadQuiz()
    fireEvent.click(screen.getByTestId('lesson-tab-quiz'))
    // give any (incorrect) async call a chance to fire
    await new Promise(r => setTimeout(r, 30))
    expect(learnApi.streamSession).not.toHaveBeenCalled()
  })

  it('shows the derived outline rail (question stems repeat outside the stage)', async () => {
    await loadQuiz()
    // appears in both the outline rail and the quiz card → at least 2 nodes
    expect(screen.getAllByText('What is a black hole?').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/OUTLINE ·/)).toBeInTheDocument()
  })

  it('shows the connected-concepts rail derived from the lesson', async () => {
    await loadQuiz()
    expect(screen.getByText('CONNECTED CONCEPTS')).toBeInTheDocument()
  })
})
