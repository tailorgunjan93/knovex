/**
 * Chat Page — placeholder for Sprint 4
 */

import { Box, Typography } from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'

export default function ChatPage() {
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
      <ChatBubbleOutlineIcon sx={{ fontSize: 64, opacity: 0.3 }} />
      <Typography variant="h5" fontWeight={600} color="text.primary">
        Chat
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 400, textAlign: 'center' }}>
        Conversational AI over your knowledge bases with streaming responses and
        source citations. Coming in Sprint 4.
      </Typography>
    </Box>
  )
}
