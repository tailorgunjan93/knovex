/**
 * Review — spaced-repetition return loop.
 *
 * Surfaces the flashcards whose SM-2 schedule is due now (GET /learn/reviews/due),
 * runs them one at a time (front → reveal → grade), and posts each grade back so
 * the card reschedules. This is the retention hook: the sidebar "Review" badge
 * shows the due count, one click lands here, and grading clears the queue.
 */

import { useState } from 'react'
import { Box, Typography, Button, Chip, CircularProgress, alpha, useTheme } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { learnApi, type DueReviewCard } from '@/api/learn.api'
import { BRAND } from '@/theme/tokens'

type Ease = 'again' | 'hard' | 'good' | 'easy'

const GRADES: { ease: Ease; label: string; color: string }[] = [
  { ease: 'again', label: 'Again', color: '#D2544B' },
  { ease: 'hard',  label: 'Hard',  color: '#C98A3C' },
  { ease: 'good',  label: 'Good',  color: '#3A8D7A' },
  { ease: 'easy',  label: 'Easy',  color: '#3E7CB1' },
]

export default function ReviewPage() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', 'due'],
    queryFn: () => learnApi.getDueReviews(20),
    refetchOnWindowFocus: false,
  })

  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)

  const cards: DueReviewCard[] = data?.cards ?? []
  const card = cards[idx]

  const grade = useMutation({
    mutationFn: ({ ease }: { ease: Ease }) =>
      learnApi.reviewFlashcard(card.session_id, card.card_index, ease),
    onSuccess: () => {
      setRevealed(false)
      setIdx((i) => i + 1)
      // Keep the sidebar badge in sync as the queue drains.
      qc.invalidateQueries({ queryKey: ['reviews', 'count'] })
    },
  })

  if (isLoading) {
    return (
      <Centered>
        <CircularProgress size={26} sx={{ color: BRAND.copper }} data-testid="review-loading" />
      </Centered>
    )
  }

  // Empty queue OR finished the batch → caught up.
  if (cards.length === 0 || idx >= cards.length) {
    return (
      <Centered>
        <Box sx={{ textAlign: 'center', maxWidth: 420 }} data-testid="review-empty">
          <CheckCircleOutlineIcon sx={{ fontSize: 48, color: '#3A8D7A', mb: 1.5 }} />
          <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 0.5 }}>All caught up</Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6 }}>
            {cards.length === 0
              ? 'Nothing is due for review right now. Rate flashcards in a lesson and they’ll come back here, spaced out over time.'
              : 'You’ve reviewed everything that was due. Come back when more cards are scheduled.'}
          </Typography>
        </Box>
      </Centered>
    )
  }

  const remaining = cards.length - idx

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: 3, py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>Review</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            Spaced repetition keeps it in long-term memory.
          </Typography>
        </Box>
        <Chip
          label={`${remaining} due`}
          size="small"
          data-testid="review-progress"
          sx={{ fontWeight: 700, color: BRAND.copper, bgcolor: alpha(BRAND.copper, 0.14) }}
        />
      </Box>

      <Box
        data-testid="review-card"
        sx={{
          borderRadius: 4, border: '1px solid', borderColor: alpha(BRAND.copper, 0.3),
          bgcolor: isDark ? alpha(BRAND.copper, 0.04) : 'background.paper',
          p: 4, minHeight: 260, display: 'flex', flexDirection: 'column',
        }}
      >
        <Chip
          label={card.topic}
          size="small"
          sx={{ alignSelf: 'flex-start', mb: 2, fontSize: 11, color: 'text.secondary' }}
        />

        <Typography data-testid="review-front" sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
          {card.front}
        </Typography>

        {revealed && (
          <Box sx={{ mt: 2.5, pt: 2.5, borderTop: '1px dashed', borderColor: 'divider' }} data-testid="review-back">
            <Typography sx={{ fontSize: 17, lineHeight: 1.55 }}>{card.back}</Typography>
            {card.hint && (
              <Typography sx={{ mt: 1.5, fontSize: 13, color: 'text.secondary', fontStyle: 'italic' }}>
                Hint: {card.hint}
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        {!revealed ? (
          <Button
            data-testid="review-reveal"
            onClick={() => setRevealed(true)}
            sx={{
              alignSelf: 'center', mt: 3, px: 4, py: 1, borderRadius: 99, textTransform: 'none',
              fontSize: 14, fontWeight: 700, color: '#fff', bgcolor: BRAND.copper,
              '&:hover': { bgcolor: alpha(BRAND.copper, 0.85) },
            }}
          >
            Show answer
          </Button>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
            {GRADES.map((g) => (
              <Button
                key={g.ease}
                data-testid={`rate-${g.ease}`}
                disabled={grade.isPending}
                onClick={() => grade.mutate({ ease: g.ease })}
                sx={{
                  flex: 1, py: 1.1, borderRadius: 2.5, textTransform: 'none', fontWeight: 700,
                  fontSize: 13.5, color: g.color, border: '1px solid', borderColor: alpha(g.color, 0.5),
                  bgcolor: alpha(g.color, 0.08),
                  '&:hover': { bgcolor: alpha(g.color, 0.16) },
                }}
              >
                {g.label}
              </Button>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', px: 3 }}>
      {children}
    </Box>
  )
}
