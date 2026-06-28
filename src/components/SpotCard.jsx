import { useEffect, useState } from 'react'

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  return Math.floor(mins / 60) + 'h ago'
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function waPhone(raw) {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  return digits
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'User'
}

function teamsChatLink(email, message) {
  if (!email) return '#'
  return 'https://teams.microsoft.com/l/chat/0/0?users=' + encodeURIComponent(email) + '&message=' + encodeURIComponent(message)
}

const FLOOR_COLORS = {
  '-2': '#ccbd00',
  '-3': '#dcb400',
  '-4': '#9e1613',
  '-5': '#8c3849',
}

function getSpotFloor(spotNumber) {
  const n = Number((spotNumber || '').replace(/\D/g, ''))
  if (n >= 5246 && n <= 5262) return '-5'
  if (n >= 4121 && n <= 4137) return '-4'
  if (n >= 3103 && n <= 3119) return '-3'
  if (n >= 2040 && n <= 2054) return '-2'
  return null
}

export default function SpotCard({ departure, currentUser, canClaim, onClaim, onRefresh }) {
  const [busy, setBusy]       = useState(false)
  const [claimed, setClaimed] = useState(null)
  const [errMsg, setErrMsg]   = useState('')
  const [claimedFading, setClaimedFading] = useState(false)

  const myId  = currentUser?.userId
  const isOwn = departure.userId === myId
  const claimedByMe = departure.status === 'claimed' && departure.claimedBy?.userId === myId
  const floor = getSpotFloor(departure.spotNumber)
  const floorColor = floor ? FLOOR_COLORS[floor] : 'var(--color-primary)'

  async function handleClaim() {
    setBusy(true)
    setErrMsg('')
    try {
      const res = await fetch('/api/departures/' + departure.id + '/ping', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      })
      if (res.ok) {
        const data = await res.json()
        setClaimed({
          posterName: data.posterName || departure.userName,
          posterEmail: data.posterEmail || departure.userEmail,
          posterPhone: data.posterPhone || '',
          spotNumber: data.spotNumber || departure.spotNumber,
          pingCount: data.pingCount || 1
        })
        setClaimedFading(false)
        onClaim && onClaim()
      } else {
        const err = await res.json().catch(() => ({}))
        setErrMsg(err.error || 'Could not claim spot. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!claimed) return
    const fadeTimer = setTimeout(() => setClaimedFading(true), 4500)
    const removeTimer = setTimeout(() => { onRefresh && onRefresh() }, 5000)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [claimed, onRefresh])

  async function handleCancel() {
    if (!window.confirm('Cancel your departure post?')) return
    setBusy(true)
    await fetch('/api/departures/' + departure.id + '/cancel', { method: 'POST' })
    setBusy(false)
    onRefresh()
  }

  if (claimed) {
    const phone = waPhone(claimed.posterPhone)
    const text  = 'Hi ' + claimed.posterName + '! I just claimed your spot ' + claimed.spotNumber + ' on ChargePass. When are you leaving?'
    const waLink = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text)
    const teamsLink = teamsChatLink(claimed.posterEmail, text)
    const posterFirst = firstName(claimed.posterName)

    return (
      <div className={'spot-card claimed-after-ping' + (claimedFading ? ' fade-out' : '')} style={{ borderColor: floorColor, borderWidth: 2, background: '#f0fdf4' }}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>&#10003;</div>
          <div className="spot-number" style={{ margin: '0 auto 10px', display: 'inline-block', color: floorColor }}>{claimed.spotNumber}</div>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Ping sent!</p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
            The poster will accept it from My Activity. Contact <strong>{claimed.posterName}</strong> to coordinate the handoff.
          </p>
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="btn btn-full"
            style={{ background: '#25d366', color: 'white', marginBottom: 10, fontWeight: 700 }}
          >
            {`Message ${posterFirst} on WhatsApp`}
          </a>
          <a href={teamsLink} target="_blank" rel="noopener noreferrer"
            className="btn btn-full btn-teams"
            style={{ marginBottom: 10, fontWeight: 700 }}
          >
            {`Message ${posterFirst} on Teams`}
          </a>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Go to <strong>My Activity</strong> to confirm when you arrive.
          </p>
        </div>
      </div>
    )
  }

  if (claimedByMe) {
    return (
      <div className="spot-card claimed-after-ping" style={{ borderColor: floorColor, borderWidth: 2, background: '#eff6ff' }}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>&#10003;</div>
          <div className="spot-number" style={{ margin: '0 auto 10px', display: 'inline-block', color: floorColor }}>{departure.spotNumber}</div>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Claimed by you</p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
            Open <strong>My Activity</strong> to chat with the poster and complete the handoff.
          </p>
          <a href="/my-activity" className="btn btn-full btn-primary">
            Go to My Activity
          </a>
        </div>
      </div>
    )
  }

  if (isOwn && departure.status === 'claimed') {
    return (
      <div className="spot-card own" style={{ borderLeft: `6px solid ${floorColor}`, background: '#fefce8' }}>
        <div className="spot-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="spot-number" style={{ color: floorColor }}>{departure.spotNumber}</div>
            {floor && (
              <span className="spot-badge" style={{ background: `${floorColor}20`, color: floorColor }}>{`Floor ${floor}`}</span>
            )}
          </div>
          <span className="spot-badge badge-claimed">Claimed</span>
        </div>
        <div className="spot-user">
          <div className="user-avatar" style={{ width: 38, height: 38, fontSize: '0.875rem', flexShrink: 0 }}>
            {initials(departure.userName)}
          </div>
          <div>
            <div className="spot-user-name">Your departure is claimed</div>
            <div className="spot-eta">
              <strong>{departure.claimedBy?.userName || 'Someone'}</strong> is on the way
            </div>
          </div>
        </div>
        <div className="spot-actions" style={{ marginTop: 12 }}>
          <a href="/my-activity" className="btn btn-primary btn-sm">
            Open My Activity
          </a>
        </div>
      </div>
    )
  }

  const claimBlocked = !canClaim && !isOwn

  return (
    <div className={'spot-card' + (isOwn ? ' own' : '')} style={{ borderLeft: `6px solid ${floorColor}` }}>
      {errMsg && <div className="toast error">{errMsg}</div>}

      <div className="spot-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="spot-number" style={{ color: floorColor }}>{departure.spotNumber}</div>
          {floor && (
            <span className="spot-badge" style={{ background: `${floorColor}20`, color: floorColor }}>{`Floor ${floor}`}</span>
          )}
        </div>
        <span className="spot-badge badge-available">Available</span>
      </div>

      <div className="spot-user">
        <div className="user-avatar" style={{ width: 38, height: 38, fontSize: '0.875rem', flexShrink: 0 }}>
          {initials(departure.userName)}
        </div>
        <div>
          <div className="spot-user-name">
            {isOwn ? 'You (your post)' : departure.userName}
          </div>
          <div className="spot-eta">
            Leaving in ~{departure.etaMinutes} min &nbsp;&#183;&nbsp; {timeAgo(departure.postedAt)}
          </div>
        </div>
      </div>

      <div className="spot-actions" style={{ marginTop: 12 }}>
        {!isOwn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleClaim}
              disabled={busy || claimBlocked}
              title={claimBlocked ? 'Finish your current claim first — check My Activity' : ''}
            >
              {busy ? '...' : 'I Want This Spot'}
            </button>
            {claimBlocked && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                {'You already have a claimed spot — check My Activity first'}
              </p>
            )}
          </div>
        )}
        {isOwn && (
          <button className="btn btn-danger btn-sm" onClick={handleCancel} disabled={busy}>
            Cancel Post
          </button>
        )}
      </div>
    </div>
  )
}
