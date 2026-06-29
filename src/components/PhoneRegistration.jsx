import { useState } from 'react'

export default function PhoneRegistration({ user, inviteCode, onComplete }) {
  const email = user?.userDetails || ''
  const [phone, setPhone] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const digits = phone.replace(/[\s\-()+]/g, '').replace(/^00/, '')
    const normalized = digits.startsWith('972') ? digits : digits.startsWith('0') ? '972' + digits.slice(1) : digits
    if (normalized.length < 9) { setError('Please enter a valid phone number (at least 9 digits)'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/me/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: normalized,
          licensePlate: licensePlate.trim() ? licensePlate.trim().toUpperCase() : null,
          inviteCode: inviteCode || undefined
        })
      })
      if (res.ok) {
        if (inviteCode) localStorage.removeItem('chargepass_invite_code')
        onComplete()
      }
      else setError('Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
        <h1>One more step</h1>
        <p>
          {'Confirm your details so colleagues can reach you for handoff coordination.'}
        </p>
        <form onSubmit={handleSubmit} style={{ textAlign: 'left', marginTop: 28 }}>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              readOnly
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'not-allowed' }}
            />
            <p className="form-hint" style={{ marginTop: 4 }}>{'Signed in email — this cannot be changed'}</p>
            <p className="form-hint" style={{ marginTop: 4 }}>
              {'Tip: Microsoft accounts enable direct Teams message links. Private emails can still use the app and WhatsApp coordination.'}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">WhatsApp phone number</label>
            <p className="form-hint">{'e.g. 052-123-4567 or +972-52-123-4567'}</p>
            <input
              className="form-input"
              type="tel"
              placeholder="05X-XXX-XXXX"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError('') }}
              required
              autoFocus
              style={{ fontSize: '1.1rem', textAlign: 'center', letterSpacing: 1 }}
            />
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 6 }}>{error}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">License plate (optional)</label>
            <p className="form-hint">{'Used for easier handoff identification in the parking lot'}</p>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. 12-345-67"
              value={licensePlate}
              onChange={e => setLicensePlate(e.target.value)}
              style={{ textAlign: 'center', letterSpacing: 1 }}
            />
          </div>

          <div style={{ background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: '0.82rem', color: 'var(--color-primary-dark)', marginBottom: 16 }}>
            {'Your phone number is only shared with the person who claims your parking spot.'}
          </div>
          {inviteCode && (
            <div style={{ background: '#eff6ff', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: '0.82rem', color: '#1e3a8a', marginBottom: 12 }}>
              {`Invite detected (${inviteCode}). Your friend will get +3 credits once you finish registration.`}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-large"
            disabled={loading || !phone.trim()}
          >
            {loading ? 'Saving...' : "Let's go!"}
          </button>
        </form>
      </div>
    </div>
  )
}
