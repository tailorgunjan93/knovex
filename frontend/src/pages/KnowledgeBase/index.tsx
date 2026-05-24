/**
 * Knowledge Base Page — placeholder for Sprint 2
 */

import { Box, Typography, Button } from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'

export default function KnowledgeBasePage() {
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
      <FolderOpenIcon sx={{ fontSize: 64, opacity: 0.3 }} />
      <Typography variant="h5" fontWeight={600} color="text.primary">
        Knowledge Base
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 400, textAlign: 'center' }}>
        Your knowledge bases will appear here. Coming in Sprint 2 — create KBs,
        add files, and let docnest index them for instant AI retrieval.
      </Typography>
    </Box>
  )
}
