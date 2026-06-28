import { useEffect, useState } from 'react'
import useApi from '../hooks/useApi'

export default function Profile() {
  const { get, post, put, loading } = useApi()
  const [profile, setProfile] = useState(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [pushStatus, setPushStatus] = useState('')
  const inviteLink = profile?.inviteLink || (profile?.userId && typeof window !== 'undefined' ? `${window.location.origin}/?invite=${encodeURIComponent(profile.userId)}` : '')

  useEffect(() => {
    get('/api/me').then(data => {
      if (!data) return
      setProfile(data)
      setPhoneNumber(data.phoneNumber || '')
      setLicensePlate(data.licensePlate || '')
    })
  }, [get])

  async function handleSave(e) {
    e.preventDefault()
    setStatus('')
    setError('')
    const digits = phoneNumber.replace(/\D/g, '')
    if (!digits) {
      setError('Phone number is required.')
      return
    }

    const body = {
      phoneNumber: digits,
      licensePlate: licensePlate.trim() ? licensePlate.trim().toUpperCase() : null
    }
    const res = await put('/api/me/profile', body)
    if (!res) {
      setError('Failed to save profile. Please try again.')
      return
    }
    setStatus('Profile updated.')
    setProfile(prev => ({ ...prev, ...body }))
  }

  async function handleCopyInvite() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopyStatus('Invite link copied.')
    } catch {
      setCopyStatus('Could not copy automatically. Please copy it manually.')
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)))
  }

  async function enableBrowserPush() {
    setPushStatus('')
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('Browser push is not supported in this browser.')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setPushStatus('Browser notification permission was not granted.')
      return
    }
    const keyRes = await get('/api/push/public-key')
    if (!keyRes?.publicKey) {
      setPushStatus('Could not initialize push key.')
      return
    }
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey)
    })
    const saved = await post('/api/me/push-subscriptions', { subscription })
    if (!saved) {
      setPushStatus('Failed to enable browser push.')
      return
    }
    setPushStatus('Browser push notifications enabled.')
    setProfile(prev => ({ ...prev, browserPushEnabled: true }))
  }

  if (!profile) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}><div className="spinner" /></div>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">View and edit your contact details</p>
        </div>
      </div>

      <form className="card" onSubmit={handleSave}>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" value={profile.userEmail || ''} readOnly style={{ background: 'var(--color-surface-2)' }} />
          <p className="form-hint">Used for Teams chat links and notifications.</p>
        </div>

        <div className="form-group">
          <label className="form-label">WhatsApp phone number</label>
          <input
            className="form-input"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            placeholder="e.g. 052-123-4567"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">License plate (optional)</label>
          <input
            className="form-input"
            value={licensePlate}
            onChange={e => setLicensePlate(e.target.value)}
            placeholder="e.g. 12-345-67"
          />
        </div>

        {status && <p style={{ color: 'var(--color-primary)', fontSize: '0.85rem', marginBottom: 10 }}>{status}</p>}
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 10 }}>{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save changes'}
        </button>
      </form>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Browser push notifications</h3>
        <p className="form-hint" style={{ marginBottom: 10 }}>
          Get spot and handoff updates even when this tab is in the background.
        </p>
        <button type="button" className="btn btn-secondary" onClick={enableBrowserPush}>
          {profile.browserPushEnabled ? 'Browser push enabled' : 'Enable browser push'}
        </button>
        {pushStatus && <p style={{ color: 'var(--color-primary)', fontSize: '0.82rem', marginTop: 8 }}>{pushStatus}</p>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Invite a friend</h3>
        <p className="form-hint" style={{ marginBottom: 8 }}>
          You get +3 credits when a friend registers using your invite link.
        </p>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <input className="form-input" value={inviteLink} readOnly />
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleCopyInvite}>
          Copy invite link
        </button>
        {copyStatus && <p style={{ color: 'var(--color-primary)', fontSize: '0.82rem', marginTop: 8 }}>{copyStatus}</p>}
      </div>
    </div>
  )
}
