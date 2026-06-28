import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import Header from './components/Header'
import Home from './pages/Home'
import MyActivity from './pages/MyActivity'
import Leaderboard from './pages/Leaderboard'
import DemoSwitcher from './components/DemoSwitcher'
import PhoneRegistration from './components/PhoneRegistration'
import Profile from './pages/Profile'
import OnboardingGuide from './components/OnboardingGuide'

const IS_DEV = import.meta.env.DEV

function LoginScreen() {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-icon" aria-hidden="true">
          <span className="ms-logo">
            <span className="ms-logo-square ms-red" />
            <span className="ms-logo-square ms-green" />
            <span className="ms-logo-square ms-blue" />
            <span className="ms-logo-square ms-yellow" />
          </span>
        </div>
        <h1>ChargePass Microsoft Herzliya</h1>
        <p>EV charging spot handoff for Herzliya campus</p>
        <a href="/.auth/login/aad?post_login_redirect_uri=/" className="btn btn-primary btn-large">
          Sign in with Microsoft
        </a>
      </div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [user, setUser]           = useState(undefined)
  const [profile, setProfile]     = useState(undefined)
  const [profileLoadError, setProfileLoadError] = useState('')
  const [activityBadge, setActivityBadge] = useState(false)
  const [spotsBadge, setSpotsBadge] = useState(false)
  const [inAppNotifications, setInAppNotifications] = useState([])
  const [inviteCode, setInviteCode] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [fadingNotificationIds, setFadingNotificationIds] = useState([])
  const hideTimersRef = useRef(new Map())
  const removeTimersRef = useRef(new Map())
  const lastSpotsSeenAtRef = useRef(Date.now())

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/me')
      if (!res.ok) {
        setProfile(null)
        if (res.status === 401 || res.status === 403) {
          setProfileLoadError('Your sign-in session expired. Please sign in again.')
          return { ok: false, unauthorized: true }
        } else {
          setProfileLoadError(`We couldn't load your profile right now (API ${res.status}).`)
          return { ok: false, unauthorized: false }
        }
      }
      setProfile(await res.json())
      setProfileLoadError('')
      return { ok: true, unauthorized: false }
    } catch {
      setProfile(null)
      setProfileLoadError("We couldn't reach the API. Please refresh and try again.")
      return { ok: false, unauthorized: false }
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const invite = params.get('invite')
    if (invite) {
      localStorage.setItem('chargepass_invite_code', invite)
      setInviteCode(invite)
    } else {
      setInviteCode(localStorage.getItem('chargepass_invite_code') || '')
    }
  }, [location.search])

  useEffect(() => {
    fetch('/.auth/me')
      .then(r => r.json())
      .then(async data => {
        const principal = data.clientPrincipal
        setUser(principal)
        if (principal) {
          const result = await loadProfile()
          if (!result.ok && result.unauthorized) {
            setUser(null)
          }
        }
        else setProfile(null)
      })
      .catch(() => { setUser(null); setProfile(null) })
  }, [loadProfile])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/service-worker.js').catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    const loadNotifications = async () => {
      try {
        const res = await fetch('/api/me/notifications')
        if (!res.ok) return
        const rows = await res.json()
        if (!Array.isArray(rows) || !rows.length) return
        if (location.pathname !== '/my-activity') setActivityBadge(true)
        const notifications = rows.map(row => ({
          id: row.id,
          title: row.status === 'claimed'
            ? `Spot ${row.spotNumber} is claimed`
            : `New spot posted: ${row.spotNumber}`,
          message: row.status === 'claimed'
            ? `${row.claimedBy?.userName || 'Someone'} is on the way`
            : `${row.userName} is leaving in ~${row.etaMinutes} min`,
          url: '/'
        }))
        setInAppNotifications(prev => {
          const existing = new Set(prev.map(n => n.id))
          return [...notifications.filter(n => !existing.has(n.id)), ...prev].slice(0, 5)
        })
      } catch {}
    }
    loadNotifications()
    const t = setInterval(loadNotifications, 8000)
    return () => clearInterval(t)
  }, [user?.userId, location.pathname])

  useEffect(() => {
    if (!user) return
    const loadSpots = async () => {
      try {
        const res = await fetch('/api/departures')
        if (!res.ok) return
        const rows = await res.json()
        if (!Array.isArray(rows) || location.pathname === '/') return
        const hasNewSpots = rows.some(row => {
          const ts = new Date(row.postedAt).getTime()
          return Number.isFinite(ts) && ts > lastSpotsSeenAtRef.current
        })
        if (hasNewSpots) setSpotsBadge(true)
      } catch {}
    }
    loadSpots()
    const t = setInterval(loadSpots, 8000)
    return () => clearInterval(t)
  }, [user?.userId, location.pathname])

  useEffect(() => {
    if (location.pathname === '/my-activity') setActivityBadge(false)
    if (location.pathname === '/') {
      setSpotsBadge(false)
      lastSpotsSeenAtRef.current = Date.now()
    }
  }, [location.pathname])

  useEffect(() => {
    if (profile?.phoneNumber && profile.onboardingSeen === false) {
      setShowOnboarding(true)
    } else {
      setShowOnboarding(false)
    }
  }, [profile?.phoneNumber, profile?.onboardingSeen])

  useEffect(() => {
    const activeIds = new Set(inAppNotifications.map(n => n.id))

    inAppNotifications.forEach(n => {
      if (hideTimersRef.current.has(n.id)) return
      const hideTimer = setTimeout(() => {
        setFadingNotificationIds(prev => (prev.includes(n.id) ? prev : [...prev, n.id]))
        const removeTimer = setTimeout(() => {
          setInAppNotifications(prev => prev.filter(x => x.id !== n.id))
          setFadingNotificationIds(prev => prev.filter(id => id !== n.id))
          removeTimersRef.current.delete(n.id)
        }, 350)
        removeTimersRef.current.set(n.id, removeTimer)
      }, 5000)
      hideTimersRef.current.set(n.id, hideTimer)
    })

    for (const [id, timer] of hideTimersRef.current.entries()) {
      if (!activeIds.has(id)) {
        clearTimeout(timer)
        hideTimersRef.current.delete(id)
      }
    }
    for (const [id, timer] of removeTimersRef.current.entries()) {
      if (!activeIds.has(id)) {
        clearTimeout(timer)
        removeTimersRef.current.delete(id)
      }
    }
  }, [inAppNotifications])

  useEffect(() => {
    return () => {
      for (const timer of hideTimersRef.current.values()) clearTimeout(timer)
      for (const timer of removeTimersRef.current.values()) clearTimeout(timer)
    }
  }, [])

  function closeNotification(id) {
    if (hideTimersRef.current.has(id)) {
      clearTimeout(hideTimersRef.current.get(id))
      hideTimersRef.current.delete(id)
    }
    if (removeTimersRef.current.has(id)) {
      clearTimeout(removeTimersRef.current.get(id))
      removeTimersRef.current.delete(id)
    }
    setFadingNotificationIds(prev => prev.filter(x => x !== id))
    setInAppNotifications(prev => prev.filter(x => x.id !== id))
  }

  async function completeOnboarding() {
    try {
      await fetch('/api/me/onboarding-seen', { method: 'POST' })
    } catch {}
    setProfile(prev => (prev ? { ...prev, onboardingSeen: true } : prev))
    setShowOnboarding(false)
  }

  if (user === undefined || (user && profile === undefined)) {
    return <div style={{ display: 'flex', justifyContent: 'center', marginTop: 80 }}><div className="spinner" /></div>
  }

  if (profileLoadError) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-icon" aria-hidden="true">
            <span className="ms-logo">
              <span className="ms-logo-square ms-red" />
              <span className="ms-logo-square ms-green" />
              <span className="ms-logo-square ms-blue" />
              <span className="ms-logo-square ms-yellow" />
            </span>
          </div>
          <h1>ChargePass Microsoft Herzliya</h1>
          <p>{profileLoadError}</p>
          <button className="btn btn-primary btn-large" onClick={() => { window.location.reload() }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!user) return <LoginScreen />

  if (!profile || !profile.phoneNumber) {
    return <PhoneRegistration user={user} inviteCode={inviteCode} onComplete={() => { loadProfile() }} />
  }

  return (
    <div className="app">
      <Header user={user} activityBadge={activityBadge} spotsBadge={spotsBadge} />
      {inAppNotifications.length > 0 && (
        <div className="top-notification-stack">
          {inAppNotifications.map(n => (
            <div
              key={n.id}
              className={'top-notification' + (fadingNotificationIds.includes(n.id) ? ' fade-out' : '')}
              onClick={() => { navigate(n.url || '/') }}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') navigate(n.url || '/')
              }}
            >
              <div>
                <div className="top-notification-title">{n.title || 'Notification'}</div>
                <div className="top-notification-message">{n.message}</div>
              </div>
              <button
                className="top-notification-close"
                onClick={e => {
                  e.stopPropagation()
                  closeNotification(n.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <main className="main-content" style={IS_DEV ? { paddingBottom: 96 } : {}}>
        <Routes>
          <Route path="/"            element={<Home user={user} onSpotClaimed={() => setActivityBadge(true)} />} />
          <Route path="/my-activity" element={<MyActivity user={user} onViewed={() => setActivityBadge(false)} />} />
          <Route path="/leaderboard" element={<Leaderboard user={user} />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showOnboarding && <OnboardingGuide onFinish={completeOnboarding} />}
      {IS_DEV && <DemoSwitcher />}
    </div>
  )
}
