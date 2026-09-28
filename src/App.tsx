import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import './App.css'
import LoopTimeline from './LoopTimeline'

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          height?: string
          width?: string
          videoId: string
          playerVars?: Record<string, number | string>
          events?: {
            onPlaybackRateChange?: (event: YoutubePlayerEvent) => void
            onReady?: (event: YoutubePlayerEvent) => void
            onStateChange?: (event: YoutubePlayerEvent) => void
          }
        },
      ) => YoutubePlayer
      PlayerState: {
        UNSTARTED: -1
        ENDED: 0
        PLAYING: 1
        PAUSED: 2
        BUFFERING: 3
        CUED: 5
      }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

type YoutubePlayer = {
  destroy: () => void
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  getAvailablePlaybackRates: () => number[]
  getPlaybackRate: () => number
  setPlaybackRate: (rate: number) => void
  loadVideoById: (videoId: string) => void
  pauseVideo: () => void
  playVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
}

type YoutubePlayerEvent = {
  data?: number
  target: YoutubePlayer
}

function extractVideoId(input: string) {
  const value = input.trim()

  if (!value) {
    return ''
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
    return value
  }

  try {
    const url = new URL(value)
    const hostname = url.hostname.replace('www.', '')

    if (hostname === 'youtu.be') {
      const candidate = url.pathname.split('/').filter(Boolean)[0] ?? ''
      return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : ''
    }

    const fromQuery = url.searchParams.get('v') ?? ''
    if (/^[a-zA-Z0-9_-]{11}$/.test(fromQuery)) {
      return fromQuery
    }

    const pathSegments = url.pathname.split('/').filter(Boolean)
    const knownIndex = pathSegments.findIndex((segment) =>
      ['embed', 'shorts', 'live'].includes(segment),
    )

    if (knownIndex >= 0) {
      const candidate = pathSegments[knownIndex + 1] ?? ''
      return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : ''
    }
  } catch {
    return ''
  }

  return ''
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatPreciseTime(seconds: number) {
  const tenths = Math.round(Math.max(0, seconds) * 10)
  return `${formatTime(tenths / 10)}.${tenths % 10}`
}

function parseTime(value: string) {
  if (!/^\d+:[0-5]\d(?:[.,]\d)?$/.test(value.trim())) return NaN
  const [minutes, seconds] = value.trim().replace(',', '.').split(':').map(Number)
  return minutes * 60 + seconds
}

let youtubeApiPromise: Promise<void> | null = null

function loadYoutubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve()
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise
  }

  youtubeApiPromise = new Promise((resolve) => {
    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    )

    if (!existingScript) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(script)
    }

    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      resolve()
    }
  })

  return youtubeApiPromise
}

function App() {
  const [input, setInput] = useState('')
  const [videoId, setVideoId] = useState('')
  const [error, setError] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [title, setTitle] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)
  const [playbackRates, setPlaybackRates] = useState<number[]>([1])
  const [loopEditing, setLoopEditing] = useState(false)
  const [loopEnabled, setLoopEnabled] = useState(false)
  const [startInput, setStartInput] = useState('0:00')
  const [endInput, setEndInput] = useState('')
  const [countdownMode, setCountdownMode] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const loopStart = parseTime(startInput)
  const loopEnd = endInput ? parseTime(endInput) : duration
  const validLoop = Number.isFinite(loopStart) && Number.isFinite(loopEnd)
    && loopStart >= 0 && loopEnd > loopStart && loopEnd <= duration

  const playerRef = useRef<YoutubePlayer | null>(null)
  const restartingRef = useRef(false)
  const pendingSeekRef = useRef<{ time: number; until: number } | null>(null)
  const playerContainerRef = useRef<HTMLDivElement | null>(null)
  const pollerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!videoId) {
      return
    }

    let cancelled = false

    loadYoutubeApi().then(() => {
      if (cancelled || !window.YT?.Player || !playerContainerRef.current) {
        return
      }

      playerRef.current?.destroy()
      const playerElement = document.createElement('div')
      playerElement.id = 'youtube-player'
      playerContainerRef.current.replaceChildren(playerElement)
      playerRef.current = new window.YT.Player('youtube-player', {
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onPlaybackRateChange: (event) => {
            if (!cancelled) setPlaybackRate(event.target.getPlaybackRate())
          },
          onReady: (event) => {
            if (cancelled) {
              return
            }

            setPlaybackRates(event.target.getAvailablePlaybackRates()
              .sort((a, b) => a - b))
            setPlaybackRate(event.target.getPlaybackRate())
            setIsReady(true)
            setDuration(event.target.getDuration())
            setCurrentTime(event.target.getCurrentTime())
          },
          onStateChange: (event) => {
            if (!window.YT) {
              return
            }

            setIsPlaying(event.data === window.YT.PlayerState.PLAYING)
            setDuration(event.target.getDuration())
          },
        },
      })
    })

    return () => {
      cancelled = true
      if (pollerRef.current) {
        window.clearInterval(pollerRef.current)
      }
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [videoId])

  useEffect(() => {
    if (!isReady || !playerRef.current) {
      return
    }

    pollerRef.current = window.setInterval(() => {
      const player = playerRef.current

      if (!player) {
        return
      }

      const time = player.getCurrentTime()
      const pending = pendingSeekRef.current
      if (!pending || Math.abs(time - pending.time) < 0.15 || Date.now() >= pending.until) {
        pendingSeekRef.current = null
        setCurrentTime(time)
      }
      setDuration(player.getDuration())
    }, 100)

    return () => {
      if (pollerRef.current) {
        window.clearInterval(pollerRef.current)
        pollerRef.current = null
      }
    }
  }, [isReady])

  useEffect(() => {
    if (!videoId) return
    const controller = new AbortController()
    const url = `https://www.youtube.com/watch?v=${videoId}`
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Title unavailable')
        return response.json()
      })
      .then((data) => {
        if (typeof data.title === 'string') setTitle(data.title)
      })
      .catch(() => { /* Keep the fallback title when metadata is unavailable. */ })
    return () => controller.abort()
  }, [videoId])

  useEffect(() => {
    if (!isReady || !loopEnabled || !validLoop || loopEditing || countdown !== null) return
    const timer = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      const time = player.getCurrentTime()
      const state = player.getPlayerState()
      if (restartingRef.current) {
        if (time < loopEnd - 0.05) restartingRef.current = false
        return
      }
      if ((state === 1 || state === 0) && time >= loopEnd - 0.05) {
        restartingRef.current = true
        if (countdownMode) {
          player.pauseVideo()
          setCountdown(3)
        } else {
          player.seekTo(loopStart, true)
          player.playVideo()
        }
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [isReady, loopEnabled, loopEditing, validLoop, loopStart, loopEnd, countdownMode, countdown])

  useEffect(() => {
    if (countdown === null) return
    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1)
      } else {
        playerRef.current?.seekTo(loopStart, true)
        playerRef.current?.playVideo()
        setCountdown(null)
      }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [countdown, loopStart])

  const cancelCountdown = () => {
    setCountdown(null)
    restartingRef.current = false
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextVideoId = extractVideoId(input)

    if (!nextVideoId) {
      setError('Pega una URL de YouTube valida o un ID de 11 caracteres.')
      return
    }

    if (nextVideoId === videoId) {
      setError('')
      return
    }

    setTitle('')
    setVideoId(nextVideoId)
    setError('')
    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }

  const handlePause = () => {
    cancelCountdown()
    playerRef.current?.pauseVideo()
  }

  const handleStop = () => {
    if (!isReady) return
    handlePause()
    handleSeek(0)
    setLoopEnabled(false)
  }

  const handlePlay = (withLoop: boolean) => {
    const player = playerRef.current
    if (!player || !isReady || (withLoop && !validLoop)) return
    cancelCountdown()
    setLoopEnabled(withLoop)
    if (withLoop) {
      const time = pendingSeekRef.current?.time ?? player.getCurrentTime()
      if (time < loopStart || time >= loopEnd) handleSeek(loopStart)
    }
    player.playVideo()
  }

  const changePlaybackRate = (direction: -1 | 1) => {
    const rates = playbackRates.filter((rate) => direction === 1 ? rate > playbackRate : rate < playbackRate)
    const nextRate = direction === 1 ? rates[0] : rates.at(-1)
    if (nextRate !== undefined) playerRef.current?.setPlaybackRate(nextRate)
  }

  useEffect(() => {
    const pauseOnSpace = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !isReady || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      setCountdown(null)
      restartingRef.current = false
      playerRef.current?.pauseVideo()
    }
    window.addEventListener('keydown', pauseOnSpace, true)
    return () => window.removeEventListener('keydown', pauseOnSpace, true)
  }, [isReady])

  const handleSeek = (nextValue: number) => {
    const player = playerRef.current

    if (!player || !isReady) {
      return
    }

    cancelCountdown()
    const time = Math.max(0, Math.min(nextValue, duration))
    pendingSeekRef.current = { time, until: Date.now() + 1000 }
    player.seekTo(time, true)
    setCurrentTime(time)
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <h1>{isReady ? title || 'Vídeo de YouTube' : 'Pega la url del video de youtube'}</h1>

        {!isReady ? <form className="control-panel" onSubmit={handleSubmit}>
          <label className="field">
            <span>URL del video</span>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>

          <div className="actions">
            <button type="submit">Cargar video</button>
          </div>
        </form> : (
          <div className="control-panel">
            <label className="switch-row">
              <span>{loopEnabled ? 'Desactivar bucle' : 'Activar bucle'}</span>
              <input
                className="switch"
                type="checkbox"
                role="switch"
                checked={loopEnabled}
                onChange={(event) => {
                  setLoopEnabled(event.target.checked)
                  cancelCountdown()
                }}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Inicio</span>
                <input
                  type="text"
                  aria-label="Tiempo de inicio (minutos:segundos)"
                  value={startInput}
                  placeholder="0:00"
                  onChange={(event) => {
                    setStartInput(event.target.value)
                    cancelCountdown()
                  }}
                />
              </label>
              <label className="field">
                <span>Final</span>
                <input
                  type="text"
                  aria-label="Tiempo final (minutos:segundos)"
                  value={endInput || formatPreciseTime(Math.floor(duration * 10) / 10)}
                  onChange={(event) => {
                    setEndInput(event.target.value)
                    cancelCountdown()
                  }}
                />
              </label>
            </div>
            {!validLoop && (
              <p className="message error" role="alert">
                Usa minutos:segundos. El final debe ser posterior al inicio y no superar la duración del vídeo.
              </p>
            )}

            <label className="mode-switch">
              <span className={!countdownMode ? 'selected' : ''}>Corte seco</span>
              <input
                className="switch"
                type="checkbox"
                role="switch"
                aria-label="Cuenta atrás entre repeticiones"
                checked={countdownMode}
                onChange={(event) => {
                  setCountdownMode(event.target.checked)
                  cancelCountdown()
                }}
              />
              <span className={countdownMode ? 'selected' : ''}>Cuenta atrás</span>
            </label>
          </div>
        )}

        {error && <p className="message error">{error}</p>}
      </section>

      <section
        className={`player-panel${videoId ? '' : ' is-empty'}`}
        inert={!videoId}
        aria-label="Reproductor de vídeo"
      >
        <div className="video-area">
          <div className="player-frame" ref={playerContainerRef} />
          {countdown !== null && (
            <div className="countdown-overlay" role="status" aria-live="polite">
              <span>{countdown}</span>
            </div>
          )}
        </div>

        <div className="transport">
          <LoopTimeline
            duration={duration}
            start={loopStart}
            end={loopEnd}
            enabled={loopEnabled}
            ready={isReady}
            onChange={(start, end) => {
              setStartInput(formatPreciseTime(start))
              setEndInput(formatPreciseTime(end))
              cancelCountdown()
            }}
            onEditingChange={(editing) => {
              setLoopEditing(editing)
              if (editing) cancelCountdown()
            }}
          />
          <div className="timeline">
            <input
              className="timeline-range"
              aria-label="Posición del vídeo"
              aria-valuetext={`${formatPreciseTime(currentTime)} de ${formatPreciseTime(duration)}`}
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              style={{ '--progress': `${duration > 0 ? Math.min(currentTime / duration, 1) * 100 : 0}%` } as CSSProperties}
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => handleSeek(Number(event.target.value))}
              disabled={!isReady || duration <= 0}
            />

          </div>

          <div className="transport-toolbar">
            <div className="playback-controls">
              <button type="button" className="transport-button secondary" onClick={handleStop} disabled={!isReady} aria-label="Detener" title="Detener">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
              </button>
              <button type="button" className="transport-button" onClick={() => handlePlay(false)} disabled={!isReady} aria-label="Reproducir" title="Reproducir" aria-pressed={isPlaying && !loopEnabled}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 4v16l13-8z" /></svg>
              </button>
              <button type="button" className="transport-button loop-play" onClick={() => handlePlay(true)} disabled={!isReady || !validLoop} aria-label="Reproducir en bucle" title="Reproducir en bucle" aria-pressed={loopEnabled}>
                <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 8a8 8 0 0 0-13-2L3 9m0-5v5h5M5 16a8 8 0 0 0 13 2l3-3m0 5v-5h-5" />
                  <path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <button type="button" className="transport-button secondary" onClick={handlePause} disabled={!isReady} aria-label="Pausar" title="Pausar (espacio)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
              </button>
            </div>
            <div className="speed-controls" role="group" aria-label="Velocidad de reproducción">
              <button type="button" onClick={() => changePlaybackRate(-1)} disabled={!isReady || !playbackRates.some((rate) => rate < playbackRate)} aria-label="Reducir velocidad" title="Reducir velocidad">−</button>
              <output className="speed-bubble" aria-label="Velocidad actual" aria-live="polite">{playbackRate.toFixed(playbackRate % 0.5 === 0 ? 1 : 2)}x</output>
              <button type="button" onClick={() => changePlaybackRate(1)} disabled={!isReady || !playbackRates.some((rate) => rate > playbackRate)} aria-label="Aumentar velocidad" title="Aumentar velocidad">+</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
