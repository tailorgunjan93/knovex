/**
 * Learn Mode Page — placeholder for Sprint 6
 */

import { Box, Typography } from '@mui/material'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'

export default function LearnPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 2,
        color: 'text.secondary',
      }}
    >
      <AutoStoriesIcon sx={{ fontSize: 64, opacity: 0.3 }} />
      <Typography variant="h5" fontWeight={600} color="text.primary">
        Learn Mode
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 480, textAlign: 'center' }}>
        Turn any PDF, web URL, or topic into quizzes, flashcards, mind maps,
        timelines, and animated explainers. With XP, streaks, and achievement badges.
        Coming in Sprint 6.
      </Typography>
    </Box>
  )
}
