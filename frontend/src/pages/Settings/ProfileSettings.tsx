/**
 * Profile Settings — "00 · IDENTITY" (lab screen 16).
 *
 * The display name shown in the rail avatar + chat. Lives on this machine.
 * Extracted from the App tab into its own nav row to match the lab.
 */

import { useState } from 'react'
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings } from '@/api/settings.api'
import { useSettingsStore } from '@/store/settings.store'
import { BRAND } from '@/theme/tokens'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

export default function ProfileSettings({ settings }: { settings: AppSettings }) {
  const qc = useQueryClient()
  const { setSettings } = useSettingsStore()
  const [displayName, setDisplayName] = useState(settings.display_name ?? '')

  const nameMutation = useMutation({
    mutationFn: (name: string) => settingsApi.update({ display_name: name }),
    onSuccess: (updated) => {
      setSettings(updated)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const initial = (displayName.trim()[0] || 'Y').toUpperCase()
  const dirty = displayName.trim() !== (settings.display_name ?? '')

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography sx={{ fontSize: 20, fontWeight: 700, mb: 0.5 }}>Your profile</Typography>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6, mb: 2.5 }}>
        What should Knovex call you? This shows in the sidebar and in chat. Stays on this machine.
      </Typography>

      <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.13em', color: 'text.disabled', mb: 1 }}>
        DISPLAY NAME
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Avatar tile */}
        <Box sx={{
          width: 52, height: 52, borderRadius: 2, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: BRAND.gradient, color: BRAND.onAccent,
          fontWeight: 800, fontSize: 22,
        }}>
          {initial}
        </Box>
        <TextField
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="You"
          size="small"
          sx={{ flex: 1, minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <Button
          disableElevation
          onClick={() => nameMutation.mutate(displayName.trim())}
          disabled={nameMutation.isPending || !dirty}
          sx={{
            height: 40, px: 2.5, borderRadius: 2, fontWeight: 700, textTransform: 'none',
            background: BRAND.gradient, color: BRAND.onAccent,
            '&:hover': { background: BRAND.gradient, filter: 'brightness(1.05)' },
            '&.Mui-disabled': { background: 'action.disabledBackground', color: 'text.disabled' },
          }}
        >
          {nameMutation.isPending ? <CircularProgress size={16} /> : nameMutation.isSuccess && !dirty ? 'Saved ✓' : 'Save'}
        </Button>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 1.25 }}>
        Leave blank to just be called “You”.
      </Typography>
    </Box>
  )
}
