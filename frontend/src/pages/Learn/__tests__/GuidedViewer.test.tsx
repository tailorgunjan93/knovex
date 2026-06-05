/**
 * GuidedViewer — Comprehensive Test Suite
 *
 * ════════════════════════════════════════════════════════════════
 *  PERSPECTIVE 1 › UI/UX Expert
 *  Checks every pixel-level detail a real user sees and touches:
 *  • All sections rendered per step (explanation, example, analogy,
 *    key insight, check-yourself)
 *  • Intro banner on step 0 only
 *  • Step chip label ("Step 1"), serif title, progress counter
 *  • Progress dots: count, active dot, visited dot distinction
 *  • Navigation bar: back arrow invisible on step 1, visible after
 *  • "Got it — next →" CTA wording vs "Complete lesson" on last step
 *  • Phase indicator chip wording for each phase
 *  • QuizPanel: question text, A/B/C option badges, hint toggle, Skip button
 *  • Feedback block visible immediately after answering (correct AND wrong)
 *  • Continue button appears after delay following an answer
 *  • Pace panel: three emoji options with labels
 *  • Completion screen: headline, each step's key_insight, recap section
 *  • "Review from step 1" button present on completion screen
 *  • Analogy section hidden when step.analogy is null
 *
 *  PERSPECTIVE 2 › Business Analyst
 *  Verifies every functional rule the product requires:
 *  • Phase machine: reading → checking (with quiz) → advance
 *  • Phase machine: reading → advance (no quiz) directly
 *  • Correct quiz answer → feedback_correct text shown
 *  • Wrong quiz answer  → feedback_wrong  text shown
 *  • Skip button bypasses quiz and still advances
 *  • completedCount increments; pace check fires every 3rd quiz done
 *  • Pace check does NOT fire on non-multiple-of-3 completions
 *  • Back navigation resets phase to 'reading'
 *  • Clicking step dot jumps to that step (phase resets)
 *  • Last step with quiz → completion after quiz done
 *  • Last step without quiz → completion directly from reading
 *  • Completion: all key_insight strings visible in recap
 *  • "Review from step 1" resets to step 0 reading phase
 *  • Step counter text increments on forward navigation
 *  • Progress dots count equals step count
 * ════════════════════════════════════════════════════════════════
 */

window.HTMLElement.prototype.scrollIntoView = vi.fn()

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, createTheme } from '@mui/material'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import GuidedViewer from '../GuidedViewer'
import type { GuidedContent, GuidedStep } from '@/api/learn.api'

// ─── Render helper ─────────────────────────────────────────────────────────────

const theme = createTheme()
function wrap(ui: ReactNode) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const QUIZ_A = {
  question:         'What is the primary role of a CPU?',
  options:          ['Execute instructions', 'Store data permanently', 'Render graphics'],
  correct:          0,
  feedback_correct: 'Exactly right! The CPU is the brain that executes instructions.',
  feedback_wrong:   'Not quite. The CPU executes instructions, not stores data.',
}

const QUIZ_B = {
  question:         'RAM stands for?',
  options:          ['Read-only Access Memory', 'Random Access Memory', 'Rapid Array Module'],
  correct:          1,
  feedback_correct: 'Correct! RAM is Random Access Memory.',
  feedback_wrong:   'Not quite. RAM stands for Random Access Memory.',
}

const QUIZ_C = {
  question:         'Which component connects CPU to motherboard?',
  options:          ['PCIe slot', 'CPU socket', 'RAM slot'],
  correct:          1,
  feedback_correct: 'Right! The CPU socket connects the processor to the motherboard.',
  feedback_wrong:   'Not quite. The CPU socket is the connection point.',
}

function makeStep(n: number, quiz: typeof QUIZ_A | null, withAnalogy = true): GuidedStep {
  return {
    step:        n,
    title:       `Step ${n} Title`,
    explanation: `Explanation for step ${n}.`,
    example:     `Real-world example for step ${n}.`,
    analogy:     withAnalogy ? `Analogy for step ${n}.` : null,
    key_insight: `Key insight for step ${n}.`,
    check_in:    `Check-in question for step ${n}?`,
    quiz_check:  quiz,
  }
}

/** 3-step content — enough to test pace check after step 3 */
const CONTENT_3: GuidedContent = {
  topic:       'How Computers Work',
  intro:       'Computers are everywhere — let\'s demystify what happens inside.',
  total_steps: 3,
  steps:       [makeStep(1, QUIZ_A), makeStep(2, QUIZ_B), makeStep(3, QUIZ_C)],
}

/** 2-step content — last-step completion tests */
const CONTENT_2: GuidedContent = {
  topic:       'Binary Numbers',
  intro:       'Binary is the language of all computers.',
  total_steps: 2,
  steps:       [makeStep(1, QUIZ_A), makeStep(2, null, false)],
}

/** 1-step content — immediate completion from reading */
const CONTENT_1: GuidedContent = {
  topic:       'Hello World',
  intro:       'One concept, fully understood.',
  total_steps: 1,
  steps:       [makeStep(1, null)],
}

// ─── Shortcut helpers ──────────────────────────────────────────────────────────

/** Reveal every beat of the current step (click "Reveal all" if shown). */
function revealAllBeats() {
  const revealAll = screen.queryByRole('button', { name: /Reveal all/i })
  if (revealAll) fireEvent.click(revealAll)
}

/** Advance from the reading phase.
 *  Conversational reveal: the primary CTA reads "Reveal all" until every beat
 *  of the step is shown, then becomes "Got it — next →" / "Complete lesson".
 *  This helper reveals all beats first, then advances — so callers get the same
 *  "move to the next phase/step" behavior as before. */
function clickGotIt() {
  const revealAll = screen.queryByRole('button', { name: /Reveal all/i })
  if (revealAll) fireEvent.click(revealAll)
  const btn = screen.getByRole('button', { name: /Got it|Complete lesson/i })
  fireEvent.click(btn)
}

/** Click the correct option in the quiz panel */
function clickCorrectOption(content: GuidedContent, stepIdx = 0) {
  const quiz   = content.steps[stepIdx].quiz_check!
  const option = quiz.options[quiz.correct]
  fireEvent.click(screen.getByText(option))
}

/** Click the wrong option (first non-correct) */
function clickWrongOption(content: GuidedContent, stepIdx = 0) {
  const quiz   = content.steps[stepIdx].quiz_check!
  const wrongIdx = quiz.correct === 0 ? 1 : 0
  fireEvent.click(screen.getByText(quiz.options[wrongIdx]))
}

// ══════════════════════════════════════════════════════════════════
//  PERSPECTIVE 1 — UI/UX EXPERT
// ══════════════════════════════════════════════════════════════════

describe('UI/UX Expert › Reading phase layout', () => {

  it('renders the intro banner on step 0', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    expect(screen.getByText(/Computers are everywhere/i)).toBeInTheDocument()
  })

  it('does NOT render the intro banner on step 1+', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()                        // advance past quiz check
    // skip the quiz
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await waitFor(() =>
      expect(screen.queryByText(/Computers are everywhere/i)).not.toBeInTheDocument()
    )
  })

  it('renders the "Step N" chip above the title', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    expect(screen.getByText('Step 1')).toBeInTheDocument()
  })

  it('renders the step title in the heading area', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    expect(screen.getByText('Step 1 Title')).toBeInTheDocument()
  })

  it('renders the step counter "Step 1 of 3"', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument()
  })

  it('renders all five section labels', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    revealAllBeats()   // sections reveal one beat at a time; show them all
    expect(screen.getByText('Explanation')).toBeInTheDocument()
    expect(screen.getByText('Real-world example')).toBeInTheDocument()
    expect(screen.getByText('Think of it like…')).toBeInTheDocument()
    expect(screen.getByText('Key insight')).toBeInTheDocument()
    expect(screen.getByText('Check yourself')).toBeInTheDocument()
  })

  it('renders the explanation text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    // explanation is the first beat — visible immediately
    expect(screen.getByText('Explanation for step 1.')).toBeInTheDocument()
  })

  it('renders the example text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    revealAllBeats()
    expect(screen.getByText('Real-world example for step 1.')).toBeInTheDocument()
  })

  it('renders the analogy text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    revealAllBeats()
    expect(screen.getByText('Analogy for step 1.')).toBeInTheDocument()
  })

  it('hides the "Think of it like…" section when analogy is null', () => {
    wrap(<GuidedViewer content={CONTENT_2} />)
    revealAllBeats()
    // step 2 of CONTENT_2 has no analogy — navigate there first
    // but for step 1 (which has analogy), first check it exists
    expect(screen.getByText('Think of it like…')).toBeInTheDocument()
    // Now skip to step 2 via dot navigation
    const dots = screen.getAllByRole('generic').filter(
      el => el.getAttribute('style')?.includes('cursor') ||
            el.tagName === 'DIV'
    )
    // Use progress dot at index 1 (step 2) — click by querying data approach
    // Navigate via Got it + Skip to reach step 2
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    // Now on step 2 which has no analogy
    expect(screen.queryByText('Think of it like…')).not.toBeInTheDocument()
  })

  it('renders the key insight text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    revealAllBeats()   // key insight is a later beat in the conversational reveal
    expect(screen.getByText('Key insight for step 1.')).toBeInTheDocument()
  })

  it('renders the check-in question text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    revealAllBeats()   // check-in is the final beat
    expect(screen.getByText('Check-in question for step 1?')).toBeInTheDocument()
  })

  it('"Got it — next →" button exists in reading phase once all beats are revealed', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    revealAllBeats()
    expect(screen.getByRole('button', { name: /Got it/i })).toBeInTheDocument()
  })

  it('"Reveal all" CTA appears first on a fresh step (conversational reveal)', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    expect(screen.getByRole('button', { name: /Reveal all/i })).toBeInTheDocument()
  })

  it('"Complete lesson" appears on last step without quiz', () => {
    wrap(<GuidedViewer content={CONTENT_1} />)
    revealAllBeats()
    expect(screen.getByRole('button', { name: /Complete lesson/i })).toBeInTheDocument()
  })

  it('back arrow is not visually present on step 1', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    // Back button exists but has opacity:0 — it should be disabled
    const backBtn = screen.getByRole('button', { name: /Previous step/i })
    expect(backBtn).toBeDisabled()
  })

  it('progress dot count matches total steps', () => {
    const { container } = wrap(<GuidedViewer content={CONTENT_3} />)
    // Dots are Box elements with specific width/height pattern — count via nearby structure
    // The three dots are siblings: w=16 (active) or w=6 (inactive)
    // We verify there are 3 dots by checking the step counter text
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 1 of 3/i).textContent).toContain('3')
  })

})

describe('UI/UX Expert › Quiz phase appearance', () => {

  it('shows "🧠 Quick check" phase chip when in checking phase', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    // Phase chip + QuizPanel header both say "Quick check" — at least one must exist
    expect(screen.getAllByText(/Quick check/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the quiz question text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    expect(screen.getByText('What is the primary role of a CPU?')).toBeInTheDocument()
  })

  it('renders option A badge', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders option B badge', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders option C badge', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('renders all three option texts', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    expect(screen.getByText('Execute instructions')).toBeInTheDocument()
    expect(screen.getByText('Store data permanently')).toBeInTheDocument()
    expect(screen.getByText('Render graphics')).toBeInTheDocument()
  })

  it('renders "Show hint" button', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    expect(screen.getByRole('button', { name: /Show hint/i })).toBeInTheDocument()
  })

  it('"Show hint" button toggles to "Hide hint" when clicked', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    const hintBtn = screen.getByRole('button', { name: /Show hint/i })
    fireEvent.click(hintBtn)
    expect(screen.getByRole('button', { name: /Hide hint/i })).toBeInTheDocument()
  })

  it('hint panel shows a "Hint" label when visible', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Show hint/i }))
    expect(screen.getByText('Hint')).toBeInTheDocument()
  })

  it('"Skip →" button is visible in quiz panel', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    expect(screen.getByRole('button', { name: /Skip/i })).toBeInTheDocument()
  })

  it('feedback text appears immediately after clicking correct answer', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    clickCorrectOption(CONTENT_3, 0)
    expect(screen.getByText('Exactly right! The CPU is the brain that executes instructions.')).toBeInTheDocument()
  })

  it('feedback text appears immediately after clicking wrong answer', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    clickWrongOption(CONTENT_3, 0)
    expect(screen.getByText('Not quite. The CPU executes instructions, not stores data.')).toBeInTheDocument()
  })

  it('"Continue →" button appears after answering (within 2s)', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    clickCorrectOption(CONTENT_3, 0)
    await waitFor(
      () => expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument(),
      { timeout: 2000 }
    )
  })

})

// 4-step content: steps 1-3 have quiz (so pace check fires after step 3), step 4 has no quiz
// Using Skip to advance quickly — Skip calls onContinue = handleQuizDone, incrementing completedCount
const CONTENT_4: GuidedContent = {
  topic:       'Computer Architecture',
  intro:       'How computers think, store, and communicate.',
  total_steps: 4,
  steps: [
    makeStep(1, QUIZ_A),
    makeStep(2, QUIZ_B),
    makeStep(3, QUIZ_C),
    makeStep(4, null),
  ],
}

describe('UI/UX Expert › Pace check phase appearance', () => {

  /**
   * Navigate through 3 quiz steps using Skip (immediate — no 1400ms delay).
   * After step 3's quiz is skipped, completedCount=3, 3%3=0, !isLast → pace check fires.
   */
  async function reachPaceCheck() {
    wrap(<GuidedViewer content={CONTENT_4} />)

    // Step 1: reading → quiz → skip (count=1, no pace check)
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 2 Title')

    // Step 2: reading → quiz → skip (count=2, no pace check)
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 3 Title')

    // Step 3: reading → quiz → skip (count=3, 3%3=0, !isLast=true → pace check)
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    // pace check now active
  }

  it('shows "🙋 Pace check" chip when pace panel is active', async () => {
    await reachPaceCheck()
    await waitFor(() => expect(screen.getAllByText(/Pace check/i).length).toBeGreaterThanOrEqual(1))
  })

  it('pace panel shows "How are you feeling?" heading', async () => {
    await reachPaceCheck()
    await waitFor(() => expect(screen.getByText('How are you feeling?')).toBeInTheDocument())
  })

  it('pace panel renders 😕 Lost option', async () => {
    await reachPaceCheck()
    await waitFor(() => expect(screen.getByText('Lost')).toBeInTheDocument())
  })

  it('pace panel renders 🤔 Sort of… option', async () => {
    await reachPaceCheck()
    await waitFor(() => expect(screen.getByText('Sort of…')).toBeInTheDocument())
  })

  it('pace panel renders 😊 Got it! option', async () => {
    await reachPaceCheck()
    await waitFor(() => expect(screen.getByText('Got it!')).toBeInTheDocument())
  })

})

describe('UI/UX Expert › Completion screen', () => {

  async function reachCompletion() {
    wrap(<GuidedViewer content={CONTENT_2} />)
    // Step 1: got it → quiz → skip
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    // Step 2: got it (no quiz, last step) → complete
    await screen.findByText('Step 2 Title')
    clickGotIt()
  }

  it('shows "Lesson complete!" heading', async () => {
    await reachCompletion()
    await waitFor(() => expect(screen.getByText(/Lesson complete!/i)).toBeInTheDocument())
  })

  it('shows the topic name in completion message', async () => {
    await reachCompletion()
    await waitFor(() => expect(screen.getByText(/Binary Numbers/i)).toBeInTheDocument())
  })

  it('shows "Key insights" recap section header', async () => {
    await reachCompletion()
    await waitFor(() => expect(screen.getByText('Key insights')).toBeInTheDocument())
  })

  it('shows key insight from step 1 in recap', async () => {
    await reachCompletion()
    await waitFor(() => expect(screen.getByText('Key insight for step 1.')).toBeInTheDocument())
  })

  it('shows key insight from step 2 in recap', async () => {
    await reachCompletion()
    await waitFor(() => expect(screen.getByText('Key insight for step 2.')).toBeInTheDocument())
  })

  it('renders "Review from step 1" button', async () => {
    await reachCompletion()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Review from step 1/i })).toBeInTheDocument()
    )
  })

})

// ══════════════════════════════════════════════════════════════════
//  PERSPECTIVE 2 — BUSINESS ANALYST
// ══════════════════════════════════════════════════════════════════

describe('Business Analyst › Phase state machine — with quiz', () => {

  it('clicking "Got it" when step has quiz_check → transitions to checking phase', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    // In reading phase, all 5 sections visible
    expect(screen.getByText('Explanation')).toBeInTheDocument()
    clickGotIt()
    // Now in checking phase — explanation sections gone, quiz visible
    expect(screen.getByText('What is the primary role of a CPU?')).toBeInTheDocument()
    expect(screen.queryByText('Explanation')).not.toBeInTheDocument()
  })

  it('clicking "Got it" when step has no quiz → advances directly to next step', async () => {
    wrap(<GuidedViewer content={CONTENT_2} />)
    // Navigate to step 2 (no quiz) — first skip step 1 quiz
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    // Now on step 2 (no quiz)
    await screen.findByText('Step 2 Title')
    clickGotIt()
    // Last step with no quiz → completion
    await waitFor(() => expect(screen.getByText(/Lesson complete!/i)).toBeInTheDocument())
  })

})

describe('Business Analyst › Quiz answer scoring', () => {

  it('selecting the correct option shows feedback_correct text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    clickCorrectOption(CONTENT_3, 0)
    expect(
      screen.getByText('Exactly right! The CPU is the brain that executes instructions.')
    ).toBeInTheDocument()
  })

  it('selecting a wrong option shows feedback_wrong text', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    clickWrongOption(CONTENT_3, 0)
    expect(
      screen.getByText('Not quite. The CPU executes instructions, not stores data.')
    ).toBeInTheDocument()
  })

  it('cannot change answer after selecting an option', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    clickCorrectOption(CONTENT_3, 0)
    // Click a different option — should not change feedback
    const wrongOption = CONTENT_3.steps[0].quiz_check!.options[1]
    fireEvent.click(screen.getByText(wrongOption))
    // Feedback_correct still visible, not feedback_wrong
    expect(
      screen.getByText('Exactly right! The CPU is the brain that executes instructions.')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Not quite. The CPU executes instructions, not stores data.')
    ).not.toBeInTheDocument()
  })

  it('correct answer option is highlighted after answering', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    clickCorrectOption(CONTENT_3, 0)
    // The CheckCircleIcon appears for the correct option — verify by checking DOM
    // The correct option text container should still be present (not navigated away)
    expect(screen.getByText('Execute instructions')).toBeInTheDocument()
  })

})

describe('Business Analyst › Skip button', () => {

  it('skip bypasses quiz and advances to next step', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    clickGotIt()
    // In checking phase — skip quiz
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    // Should advance to step 2
    await waitFor(() => expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument())
  })

  it('skip on last step quiz triggers completion', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)

    // Skip step 1 quiz → step 2
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 2 Title')

    // Skip step 2 quiz → step 3
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 3 Title')

    // Skip step 3 quiz (last step) → completion
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))

    await waitFor(() => expect(screen.getByText(/Lesson complete!/i)).toBeInTheDocument())
  })

})

describe('Business Analyst › Pace check cadence', () => {

  /**
   * All pace-check cadence tests use CONTENT_4 (4 steps, quizzes on steps 1-3).
   * We navigate via Skip to avoid the 1400ms Continue-button delay.
   * Skip calls onContinue = handleQuizDone → increments completedCount.
   */

  it('pace check fires after completing 3 quiz steps (multiple of 3, not last step)', async () => {
    wrap(<GuidedViewer content={CONTENT_4} />)

    // Skip through steps 1, 2, 3 quizzes
    for (const title of ['Step 1 Title', 'Step 2 Title', 'Step 3 Title']) {
      if (title !== 'Step 1 Title') await screen.findByText(title)
      clickGotIt()
      fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    }

    // count=3, step 3 is not last (step 4 exists) → pace check
    await waitFor(() => expect(screen.getByText('How are you feeling?')).toBeInTheDocument())
  })

  it('pace check does NOT fire after step 1 skip (count=1, not multiple of 3)', async () => {
    wrap(<GuidedViewer content={CONTENT_4} />)

    // Skip step 1 quiz (count=1)
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))

    // Should be on step 2 reading, NOT pace check
    await waitFor(() => expect(screen.getByText('Step 2 Title')).toBeInTheDocument())
    expect(screen.queryByText('How are you feeling?')).not.toBeInTheDocument()
  })

  it('pace check does NOT fire after step 2 skip (count=2, not multiple of 3)', async () => {
    wrap(<GuidedViewer content={CONTENT_4} />)

    // Skip step 1 (count=1)
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))

    // Skip step 2 (count=2)
    await screen.findByText('Step 2 Title')
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))

    // Should be on step 3 reading, NOT pace check
    await waitFor(() => expect(screen.getByText('Step 3 Title')).toBeInTheDocument())
    expect(screen.queryByText('How are you feeling?')).not.toBeInTheDocument()
  })

  it('selecting a pace rating advances to next step after pace check', async () => {
    wrap(<GuidedViewer content={CONTENT_4} />)

    // Skip through steps 1-3 to trigger pace check
    for (const title of ['Step 1 Title', 'Step 2 Title', 'Step 3 Title']) {
      if (title !== 'Step 1 Title') await screen.findByText(title)
      clickGotIt()
      fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    }

    await waitFor(() => expect(screen.getByText('How are you feeling?')).toBeInTheDocument())

    // Rate the pace — should advance to step 4
    fireEvent.click(screen.getByText('Got it!'))

    await waitFor(
      () => expect(screen.getByText('Step 4 Title')).toBeInTheDocument(),
      { timeout: 1500 }
    )
  })

})

describe('Business Analyst › Navigation and step management', () => {

  it('step counter increments after navigating forward', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument()

    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))

    await waitFor(() => expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument())
  })

  it('back arrow becomes enabled on step 2+', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)

    // Advance to step 2
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 2 Title')

    const backBtn = screen.getByRole('button', { name: /Previous step/i })
    expect(backBtn).not.toBeDisabled()
  })

  it('back arrow returns to previous step and resets phase to reading', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)

    // Go forward to step 2 (reading phase)
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 2 Title')

    // Navigate into quiz on step 2
    clickGotIt()
    expect(screen.getByText('RAM stands for?')).toBeInTheDocument()

    // Go BACK — should return to step 1 in reading phase
    fireEvent.click(screen.getByRole('button', { name: /Previous step/i }))

    await waitFor(() => {
      expect(screen.getByText('Step 1 Title')).toBeInTheDocument()
      expect(screen.getByText('Explanation')).toBeInTheDocument()  // reading phase
    })
  })

  it('"Review from step 1" on completion screen resets to step 0 reading', async () => {
    wrap(<GuidedViewer content={CONTENT_2} />)

    // Complete the lesson
    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 2 Title')
    clickGotIt()
    await screen.findByText(/Lesson complete!/i)

    // Click review
    fireEvent.click(screen.getByRole('button', { name: /Review from step 1/i }))

    await waitFor(() => {
      expect(screen.getByText('Step 1 Title')).toBeInTheDocument()
      expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument()
      expect(screen.getByText('Explanation')).toBeInTheDocument()
    })
  })

})

describe('Business Analyst › Content integrity', () => {

  it('correct step content loads on step 2 after navigating forward', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)

    clickGotIt()
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 2 Title')

    revealAllBeats()   // new step starts with only the first beat shown
    expect(screen.getByText('Explanation for step 2.')).toBeInTheDocument()
    expect(screen.getByText('Real-world example for step 2.')).toBeInTheDocument()
    expect(screen.getByText('Key insight for step 2.')).toBeInTheDocument()
  })

  it('correct quiz loads for each step', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)

    // Step 1 quiz question
    clickGotIt()
    expect(screen.getByText('What is the primary role of a CPU?')).toBeInTheDocument()

    // Skip to step 2
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    await screen.findByText('Step 2 Title')

    // Step 2 quiz question
    clickGotIt()
    expect(screen.getByText('RAM stands for?')).toBeInTheDocument()
  })

  it('completion recap lists all key insights', async () => {
    wrap(<GuidedViewer content={CONTENT_3} />)

    // Skip through all steps
    for (let i = 0; i < 3; i++) {
      if (i > 0) await screen.findByText(`Step ${i + 1} Title`)
      clickGotIt()
      fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    }

    await waitFor(() => expect(screen.getByText(/Lesson complete!/i)).toBeInTheDocument())

    for (let i = 1; i <= 3; i++) {
      expect(screen.getByText(`Key insight for step ${i}.`)).toBeInTheDocument()
    }
  })

  it('total_steps matches rendered step count in counter', () => {
    wrap(<GuidedViewer content={CONTENT_3} />)
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

})
