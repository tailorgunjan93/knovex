/**
 * Learn API — typed wrappers for all /api/learn/* endpoints
 *
 * Formats: quiz | flashcard | mindmap | timeline | story | eli5 | speedlearn | brainstorm
 * SSE streaming is handled via native fetch + ReadableStream.
 */

import apiClient, { API_BASE } from './client'

// ─── Domain types ─────────────────────────────────────────────────────────────

export type LearnFormat =
  | 'quiz'
  | 'flashcard'
  | 'mindmap'
  | 'timeline'
  | 'story'
  | 'eli5'
  | 'speedlearn'
  | 'brainstorm'

export type Difficulty = 'beginner' | 'intermediate' | 'expert'

export type SourceType = 'topic' | 'kb_file' | 'url'

export interface LearnSession {
  id: string
  topic: string
  format: LearnFormat
  source_type: SourceType
  difficulty: Difficulty
  status: 'pending' | 'generating' | 'ready' | 'error'
  content: QuizContent | FlashcardContent | MindmapContent | TimelineContent | TextContent | null
  created_at: string
  completed_at: string | null
}

// ─── Content shapes ───────────────────────────────────────────────────────────

export interface QuizQuestion {
  q: string
  options: string[]
  correct: number          // 0-based index
  explanation: string
}
export interface QuizContent {
  questions: QuizQuestion[]
}

export interface FlashCard {
  front: string
  back: string
  hint: string
}
export interface FlashcardContent {
  cards: FlashCard[]
}

export interface MindmapNode {
  label: string
  children: MindmapNode[]
}
export interface MindmapContent {
  root: string
  branches: MindmapNode[]
}

export interface TimelineEvent {
  year: string
  title: string
  description: string
}
export interface TimelineContent {
  events: TimelineEvent[]
}

export interface TextContent {
  text: string
}

// ─── SSE event types ──────────────────────────────────────────────────────────

export type LearnSSEEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; session_id: string; xp_earned: number; new_badges: string[] }
  | { type: 'error'; error: string }

// ─── Gamification ─────────────────────────────────────────────────────────────

export interface UserStats {
  xp: number
  level: number
  streak: number
  last_activity: string | null
  badges: string[]
}

export interface QuizAnswerResult {
  correct: boolean
  correct_answer: string
  explanation: string
  xp_earned: number
  session_score: number
}

export interface FlashcardReviewResult {
  card_index: number
  ease_rating: string
  next_review_at: string
}

// ─── API calls ───────────────────────────────────────────────────────────────

export const learnApi = {
  /** List the 50 most recent learn sessions. */
  async listSessions(): Promise<LearnSession[]> {
    const res = await apiClient.get<LearnSession[]>('/learn/sessions')
    return res.data
  },

  /** Get a single session by ID. */
  async getSession(sessionId: string): Promise<LearnSession> {
    const res = await apiClient.get<LearnSession>(`/learn/sessions/${sessionId}`)
    return res.data
  },

  /** Delete a session. */
  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/learn/sessions/${sessionId}`)
  },

  /** Get user gamification stats (XP, level, streak, badges). */
  async getUserStats(): Promise<UserStats> {
    const res = await apiClient.get<UserStats>('/learn/stats')
    return res.data
  },

  /** Submit a quiz answer. Returns correctness, explanation, and XP earned. */
  async submitQuizAnswer(
    sessionId: string,
    questionIndex: number,
    answer: string,
  ): Promise<QuizAnswerResult> {
    const res = await apiClient.post<QuizAnswerResult>(
      `/learn/sessions/${sessionId}/quiz/answer`,
      { question_index: questionIndex, answer },
    )
    return res.data
  },

  /** Rate a flashcard for spaced repetition (again / hard / good / easy). */
  async reviewFlashcard(
    sessionId: string,
    cardIndex: number,
    easeRating: 'again' | 'hard' | 'good' | 'easy',
  ): Promise<FlashcardReviewResult> {
    const res = await apiClient.post<FlashcardReviewResult>(
      `/learn/sessions/${sessionId}/flashcard/review`,
      null,
      { params: { card_index: cardIndex, ease_rating: easeRating } },
    )
    return res.data
  },

  /**
   * Create a learn session and stream generated content via SSE.
   *
   * @param topic      The topic to learn about.
   * @param format     One of the 8 learn formats.
   * @param difficulty beginner | intermediate | expert
   * @param onEvent    Called for each SSE event as it arrives.
   * @param signal     Optional AbortSignal to cancel the stream.
   */
  async streamSession(
    topic: string,
    format: LearnFormat,
    difficulty: Difficulty,
    onEvent: (event: LearnSSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/learn/sessions/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          format,
          difficulty,
          source_type: 'topic',
        }),
        signal,
      },
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Stream failed: HTTP ${response.status} — ${text}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as LearnSSEEvent
            onEvent(event)
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    }
  },
}
