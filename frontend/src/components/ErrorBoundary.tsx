/**
 * RootErrorBoundary
 *
 * Wraps the entire React tree at the topmost level.
 * React 18 unmounts the whole tree when an uncaught render error occurs and no
 * ErrorBoundary catches it — resulting in a completely blank window.  This
 * component intercepts any such error and renders a plain styled error screen
 * (intentionally written in vanilla HTML/CSS without MUI or any other
 * dependency that might itself be the source of the error).
 *
 * Usage (main.tsx):
 *   <RootErrorBoundary>
 *     <App />
 *   </RootErrorBoundary>
 */

import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    // Always log — visible in DevTools (Ctrl+Shift+I) and in the Electron
    // main-process console when running in dev mode.
    console.error('[Knovex] Uncaught render error:', error)
    console.error('[Knovex] Component stack:', errorInfo.componentStack)
  }

  private handleReload = () => {
    // Reset state first so we attempt a full re-render before hard-reloading
    this.setState({ error: null, errorInfo: null })
    // If the reset doesn't fix it, reload the page
    setTimeout(() => window.location.reload(), 50)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    const { error, errorInfo } = this.state

    return (
      <div
        style={{
          height:         '100vh',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          background:     '#0B0B0C',
          color:          '#F5F1EA',
          padding:        '2rem',
          fontFamily:     '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
          boxSizing:      'border-box',
          overflow:       'hidden',
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: 36, marginBottom: 12, lineHeight: 1 }}>⚠️</div>

        {/* Heading */}
        <h1
          style={{
            fontSize:     20,
            fontWeight:   600,
            margin:       '0 0 8px',
            letterSpacing:'-0.01em',
          }}
        >
          Knovex encountered an error
        </h1>

        {/* Error message */}
        <p
          style={{
            fontSize:   13,
            color:      'rgba(245,241,234,0.55)',
            maxWidth:   500,
            textAlign:  'center',
            margin:     '0 0 20px',
            lineHeight: 1.5,
          }}
        >
          {error.message || 'An unknown error occurred during rendering.'}
        </p>

        {/* Stack trace box */}
        <pre
          style={{
            fontSize:    11,
            color:       'rgba(245,241,234,0.35)',
            background:  '#111114',
            border:      '1px solid #26252B',
            padding:     '12px 16px',
            borderRadius:8,
            maxWidth:    680,
            width:       '100%',
            maxHeight:   220,
            overflow:    'auto',
            whiteSpace:  'pre-wrap',
            wordBreak:   'break-all',
            margin:      '0 0 20px',
            fontFamily:  '"IBM Plex Mono", "Cascadia Code", monospace',
            textAlign:   'left',
          }}
        >
          {error.stack ?? error.message}
          {errorInfo?.componentStack
            ? `\n\nComponent stack:${errorInfo.componentStack}`
            : ''}
        </pre>

        {/* Hint */}
        <p
          style={{
            fontSize:   11,
            color:      'rgba(245,241,234,0.30)',
            margin:     '0 0 20px',
            fontFamily: '"IBM Plex Mono", monospace',
            letterSpacing: '0.01em',
          }}
        >
          Press <kbd style={{ background:'#1D1D22', border:'1px solid #26252B', borderRadius:4, padding:'1px 6px' }}>Ctrl+Shift+I</kbd> to open DevTools for more details
        </p>

        {/* Reload button */}
        <button
          onClick={this.handleReload}
          style={{
            padding:      '9px 24px',
            borderRadius:  8,
            background:   'linear-gradient(135deg,#DDA76A,#B5803E)',
            color:        '#1A140C',
            border:       'none',
            cursor:       'pointer',
            fontSize:     14,
            fontWeight:   600,
            letterSpacing:'-0.01em',
          }}
        >
          Reload Knovex
        </button>
      </div>
    )
  }
}
