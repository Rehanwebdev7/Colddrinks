import { getToken, onMessage } from 'firebase/messaging'
import { messagingPromise } from '../config/firebaseConfig'
import API from '../config/api'
import toast from 'react-hot-toast'

const VAPID_KEY = 'BB8JTrgtokgWn6CaQ2xEnok-ZUati24zDdUn86B32j75tgNcov50fGmgfGV9mu4V2e-DPQLtqOT_rPzkifvWUnE'
const FCM_TOKEN_KEY = 'fcm_token'
const TOKEN_REFRESH_INTERVAL = 55 * 60 * 1000

// ─── State ──────────────────────────────────────────────────────────────────

let audioContext = null
let unsubscribeForeground = null
let refreshIntervalId = null
let swRegistration = null

// ─── Notification Sound ─────────────────────────────────────────────────────

function ensureAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
    } catch { /* unsupported */ }
  }
  return audioContext
}

// Warm up AudioContext on user interaction (keep retrying, not once)
if (typeof window !== 'undefined') {
  const warmUp = () => {
    const ctx = ensureAudioContext()
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        // Remove listeners once context is running
        ;['click', 'touchstart', 'keydown'].forEach(e =>
          document.removeEventListener(e, warmUp, { capture: true })
        )
      })
    }
  }
  ;['click', 'touchstart', 'keydown'].forEach(e =>
    document.addEventListener(e, warmUp, { capture: true })
  )
}

async function playNotificationSound() {
  try {
    const ctx = ensureAudioContext()
    if (!ctx) return

    // Must await resume on mobile — oscillators won't play if context is suspended
    if (ctx.state === 'suspended') await ctx.resume()

    const t = ctx.currentTime

    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.8, t + 0.02)
    gain.gain.linearRampToValueAtTime(0.4, t + 0.12)
    gain.gain.linearRampToValueAtTime(0.8, t + 0.18)
    gain.gain.linearRampToValueAtTime(0, t + 0.5)

    // Tone 1 — A5
    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = 880
    o1.connect(gain)
    o1.start(t)
    o1.stop(t + 0.18)

    // Tone 2 — D6 (higher, attention-grabbing)
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = 1174.66
    o2.connect(gain)
    o2.start(t + 0.18)
    o2.stop(t + 0.5)

    console.log('[FCM] Sound played')
  } catch (err) {
    console.warn('[FCM] Sound error:', err)
  }
}

async function playPaymentSound() {
  try {
    const ctx = ensureAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') await ctx.resume()

    const t = ctx.currentTime

    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.7, t + 0.02)
    gain.gain.linearRampToValueAtTime(0.6, t + 0.15)
    gain.gain.linearRampToValueAtTime(0.7, t + 0.3)
    gain.gain.linearRampToValueAtTime(0, t + 0.65)

    // Cash register style - 3 quick ascending tones
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5 (major chord)
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = freq
      o.connect(gain)
      o.start(t + i * 0.12)
      o.stop(t + i * 0.12 + 0.18)
    })

    console.log('[FCM] Payment sound played')
  } catch (err) {
    console.warn('[FCM] Payment sound error:', err)
  }
}

// ─── Service Worker Registration ────────────────────────────────────────────

async function getServiceWorkerRegistration() {
  if (swRegistration) return swRegistration

  if (!('serviceWorker' in navigator)) {
    console.error('[FCM] Service workers not supported')
    return null
  }

  try {
    // Unregister any old service workers first to avoid version conflicts
    const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
    if (existing) {
      await existing.update()
      swRegistration = existing
    } else {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    }
    await navigator.serviceWorker.ready
    console.log('[FCM] Service worker ready')
    return swRegistration
  } catch (err) {
    console.error('[FCM] SW registration failed:', err)
    return null
  }
}

// ─── Token Management ───────────────────────────────────────────────────────

function getSavedToken() {
  return localStorage.getItem(FCM_TOKEN_KEY)
}

function saveTokenLocally(token) {
  if (token) localStorage.setItem(FCM_TOKEN_KEY, token)
  else localStorage.removeItem(FCM_TOKEN_KEY)
}

async function fetchFCMToken() {
  try {
    const messaging = await messagingPromise
    if (!messaging) {
      console.warn('[FCM] Messaging not supported in this browser')
      return null
    }

    // Check / request permission
    let permission = Notification.permission
    if (permission === 'default') {
      console.log('[FCM] Requesting notification permission...')
      permission = await Notification.requestPermission()
    }
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission:', permission)
      return null
    }
    console.log('[FCM] Permission granted')

    const registration = await getServiceWorkerRegistration()
    if (!registration) return null

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    })

    if (token) {
      console.log('[FCM] Token obtained:', token.substring(0, 20) + '...')
      return token
    }

    console.warn('[FCM] No token received')
    return null
  } catch (err) {
    console.error('[FCM] Token fetch error:', err)
    return null
  }
}

async function syncTokenToBackend(newToken) {
  const oldToken = getSavedToken()
  if (newToken === oldToken) {
    console.log('[FCM] Token unchanged, skip sync')
    return
  }

  try {
    await API.post('/auth/fcm-token', { fcmToken: newToken })
    saveTokenLocally(newToken)
    console.log('[FCM] Token synced to backend')
  } catch (err) {
    console.error('[FCM] Token sync failed:', err)
  }
}

async function refreshToken() {
  const newToken = await fetchFCMToken()
  if (newToken) await syncTokenToBackend(newToken)
}

// ─── Foreground Message Listener ────────────────────────────────────────────

async function startForegroundListener() {
  if (unsubscribeForeground) {
    unsubscribeForeground()
    unsubscribeForeground = null
  }

  try {
    const messaging = await messagingPromise
    if (!messaging) return

    unsubscribeForeground = onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message:', payload)

      // Data-only messages: title/body are in payload.data
      const data = payload.data || {}
      const title = data.title || payload.notification?.title || 'Notification'
      const body = data.body || payload.notification?.body || ''

      // Play sound - different for payment notifications
      const type = (payload.data?.type || '').toLowerCase()
      if (type === 'payment') {
        playPaymentSound()
      } else {
        playNotificationSound()
      }

      // Show toast
      toast(title + '\n' + body, {
        duration: 6000,
        position: 'top-right',
        style: {
          minWidth: '300px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          cursor: 'pointer',
          whiteSpace: 'pre-line',
          fontWeight: '500'
        },
        icon: '\uD83D\uDD14'
      })

      // Also show native notification (clickable)
      const isAdmin = window.location.pathname.startsWith('/admin')
      let navUrl = isAdmin ? '/admin/notifications' : '/notifications'
      if (type === 'order' || type === 'new_order') navUrl = isAdmin ? '/admin/orders' : '/my-orders'
      else if (type === 'payment') navUrl = isAdmin ? '/admin/payments' : '/profile'

      if (Notification.permission === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            icon: '/images/logo.png',
            tag: type || 'general',
            renotify: true
          })
          n.onclick = () => { window.focus(); window.location.href = navUrl; n.close() }
        } catch { /* mobile browsers may not support Notification constructor */ }
      }
    })

    console.log('[FCM] Foreground listener active')
  } catch (err) {
    console.error('[FCM] Foreground listener error:', err)
  }
}

// ─── Visibility Refresh ─────────────────────────────────────────────────────

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') refreshToken()
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function initializeFCM() {
  console.log('[FCM] Initializing...')

  const token = await fetchFCMToken()
  if (token) {
    await syncTokenToBackend(token)
  } else {
    console.warn('[FCM] No token — push notifications will not work')
  }

  await startForegroundListener()

  if (refreshIntervalId) clearInterval(refreshIntervalId)
  refreshIntervalId = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL)

  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  console.log('[FCM] Initialization complete, token:', token ? 'YES' : 'NO')
  return token
}

export async function cleanupFCM(isAdmin = false) {
  if (refreshIntervalId) { clearInterval(refreshIntervalId); refreshIntervalId = null }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (unsubscribeForeground) { unsubscribeForeground(); unsubscribeForeground = null }

  if (!isAdmin) {
    try { await API.post('/auth/fcm-token', { fcmToken: null }) } catch {}
  }

  saveTokenLocally(null)
  console.log('[FCM] Cleanup done, isAdmin:', isAdmin)
}
