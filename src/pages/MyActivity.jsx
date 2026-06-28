import { useState, useEffect, useCallback } from 'react'
import useApi from '../hooks/useApi'

function waLink(phone, posterName, spotNumber) {
  const digits = (phone || '').replace(/\D/g, '')
  const waPhone = digits.startsWith('0') ? '972' + digits.slice(1) : digits
  const msg = 'Hi ' + posterName + '! I claimed your spot ' + spotNumber + ' on ChargePass. When are you leaving?'
  return 'https://wa.me/' + waPhone + '?text=' + encodeURIComponent(msg)
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

export default function MyActivity({ user, onViewed }) {
  const { get, post, loading } = useApi()
  const [activity, setActivity]   = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [delaying, setDelaying] = useState(false)
  const [noShowResult, setNoShowResult] = useState(null) // 'reposted' | 'expired'
  const [notificationHistory, setNotificationHistory] = useState([])
  const [claimerChatInput, setClaimerChatInput] = useState('')
  const [posterChatInput, setPosterChatInput] = useState('')

  const loadActivity = useCallback(async () => {
    const [data, history] = await Promise.all([
      get('/api/me/activity'),
      get('/api/me/notifications-history')
    ])
    if (data) setActivity(data)
    if (Array.isArray(history)) setNotificationHistory(history)
  }, [get])

  useEffect(() => {
    loadActivity()
    onViewed && onViewed()
  }, [loadActivity, onViewed])

  async function handleConfirm() {
    setConfirming(true)
    const res = await post('/api/departures/' + activity.claimedSpot.id + '/confirm', {})
    setConfirming(false)
    if (res) loadActivity()
  }

  async function handleAcceptPing(pingerId) {
    if (!dep) return
    setConfirming(true)
    const res = await post('/api/departures/' + dep.id + '/accept-ping', { userId: pingerId })
    setConfirming(false)
    if (res) loadActivity()
  }

  async function handleNoShow() {
    if (!window.confirm("Confirm you did not get this spot? The poster won't receive credit points.")) return
    setConfirming(true)
    const res = await post('/api/departures/' + activity.claimedSpot.id + '/no-show', {})
    setConfirming(false)
    if (res) {
      setNoShowResult(res.reposted ? 'reposted' : 'expired')
      loadActivity()
    }
  }

  async function handleDelay(addMinutes) {
    if (!dep) return
    setDelaying(true)
    const res = await post('/api/departures/' + dep.id + '/delay', { addMinutes })
    setDelaying(false)
    if (res) loadActivity()
  }

  async function handleReleaseClaim() {
    if (!claimed) return
    if (!window.confirm('Release this claim so the spot goes back to the feed?')) return
    setConfirming(true)
    const res = await post('/api/departures/' + claimed.id + '/release-claim', {})
    setConfirming(false)
    if (res) loadActivity()
  }

  async function sendChatMessage(depId, message, reset) {
    if (!message.trim()) return
    const res = await post('/api/departures/' + depId + '/chat', { message: message.trim() })
    if (res) {
      reset('')
      loadActivity()
    }
  }

  function renderChat(depObj, input, setInput) {
    const messages = depObj?.chatMessages || []
    return (
      <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>In-app chat</div>
        <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {messages.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>No messages yet.</div>
          ) : (
            messages.map(m => {
              const mine = m.senderUserId === user?.userId
              const isSystem = m.senderUserId === 'system'
              return (
                <div key={m.id} style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  background: isSystem ? '#f1f5f9' : mine ? 'var(--color-primary-light)' : 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  borderRadius: 10,
                  padding: '6px 8px',
                  maxWidth: '90%'
                }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                    {isSystem ? 'System' : mine ? 'You' : firstName(m.senderName)}
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>{m.message}</div>
                </div>
              )
            })
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="form-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendChatMessage(depObj.id, input, setInput)
              }
            }}
            placeholder="Type a message..."
            style={{ fontSize: '0.82rem', padding: '8px 10px' }}
            maxLength={500}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => sendChatMessage(depObj.id, input, setInput)}
          >
            Send
          </button>
        </div>
      </div>
    )
  }

  if (loading && !activity) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}><div className="spinner" /></div>
  }

  const dep       = activity && activity.activeDeparture
  const claimed   = activity && activity.claimedSpot
  const completed = (activity && activity.completedHandoffs) || []
  const isPastDeadline = claimed && new Date(claimed.confirmedDeadline) < new Date()
  const claimedFloor = claimed ? getSpotFloor(claimed.spotNumber) : null
  const depFloor = dep ? getSpotFloor(dep.spotNumber) : null
  const pendingPings = dep?.pings?.filter(p => !p.isEtaUpdate) || []

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">My Activity</h1></div>
        {activity && activity.credits !== undefined && (
          <span className="credits-badge">&#9889; {activity.credits} pts total</span>
        )}
      </div>

      {noShowResult && (
        <div style={{
          background: noShowResult === 'reposted' ? '#fef3c7' : '#f1f5f9',
          border: '1.5px solid ' + (noShowResult === 'reposted' ? '#f59e0b' : 'var(--color-border)'),
          borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16, fontSize: '0.875rem'
        }}>
          {noShowResult === 'reposted'
            ? 'The spot has been put back as available for others to claim.'
            : 'The spot has been removed — the departure time had already passed.'}
        </div>
      )}

      {claimed && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-title">Spot You Claimed</div>
          <div className="card" style={{ borderColor: isPastDeadline ? 'var(--color-danger)' : '#f59e0b', borderWidth: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="spot-number" style={{ color: claimedFloor ? FLOOR_COLORS[claimedFloor] : undefined }}>{claimed.spotNumber}</span>
                {claimedFloor && (
                  <span className="spot-badge" style={{ background: `${FLOOR_COLORS[claimedFloor]}20`, color: FLOOR_COLORS[claimedFloor] }}>{`Floor ${claimedFloor}`}</span>
                )}
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>posted by {claimed.userName}</span>
            </div>

            {isPastDeadline ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12 }}>
                <p style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
                  20 minutes have passed since the departure time!
                </p>
                <p style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>
                  Did you end up getting this spot? The poster is waiting for your answer.
                </p>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
                {'Head to spot '}<strong>{claimed.spotNumber}</strong>{'. Once you arrive, tap "Got the Spot!" to complete the handoff and award the poster 3 credits.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={confirming}>
                {confirming ? '...' : 'Got the Spot!'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleNoShow} disabled={confirming}>
                Did Not Get It
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleReleaseClaim} disabled={confirming}>
                Release Claim
              </button>
            </div>

            <a
              href={waLink(claimed.posterPhone, claimed.userName, claimed.spotNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-full btn-sm"
              style={{ background: '#25d366', color: 'white', fontWeight: 700 }}
            >
              {`Message ${firstName(claimed.userName)} on WhatsApp`}
            </a>
            <a
              href={teamsChatLink(
                claimed.userEmail,
                'Hi ' + claimed.userName + '! I claimed your spot ' + claimed.spotNumber + ' on ChargePass. When are you leaving?'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-full btn-sm btn-teams"
              style={{ marginTop: 8, fontWeight: 700 }}
            >
              {`Message ${firstName(claimed.userName)} on Teams`}
            </a>
            {renderChat(claimed, claimerChatInput, setClaimerChatInput)}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div className="section-title">My Active Post</div>
        {dep ? (
          <div className="card" style={{ borderColor: depFloor ? FLOOR_COLORS[depFloor] : 'var(--color-primary)', borderWidth: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="spot-number" style={{ color: depFloor ? FLOOR_COLORS[depFloor] : undefined }}>{dep.spotNumber}</span>
                {depFloor && (
                  <span className="spot-badge" style={{ background: `${FLOOR_COLORS[depFloor]}20`, color: FLOOR_COLORS[depFloor] }}>{`Floor ${depFloor}`}</span>
                )}
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>~{dep.etaMinutes} min ETA</span>
            </div>
            {dep.status === 'claimed' ? (
              <>
                <div style={{ background: '#fef3c7', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.85rem', color: '#92400e', marginBottom: 8 }}>
                  <strong>{dep.claimedBy && dep.claimedBy.userName}</strong> is on their way — waiting for them to confirm arrival.
                  {dep.claimedBy?.userLicensePlate && (
                    <span>{' · Plate: ' + dep.claimedBy.userLicensePlate}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDelay(5)} disabled={delaying || (dep.delayExtensions || 0) >= 2}>
                    {delaying ? '...' : 'Running late +5'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDelay(10)} disabled={delaying || (dep.delayExtensions || 0) >= 2}>
                    +10
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDelay(15)} disabled={delaying || (dep.delayExtensions || 0) >= 2}>
                    +15
                  </button>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  {(dep.delayExtensions || 0) >= 2
                    ? 'Maximum ETA extensions reached for this post.'
                    : `ETA updates left: ${2 - (dep.delayExtensions || 0)} · Claimer gets notified without credit charge.`}
                </div>
                {pendingPings.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 10 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                      Pending claims
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pendingPings.map(p => (
                        <div key={p.userId} style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.userName}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                            {p.userEmail}
                            {p.userPhone ? ` · ${p.userPhone}` : ''}
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => handleAcceptPing(p.userId)} disabled={confirming}>
                            Accept this claim
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {dep.claimedBy?.userPhone && (
                    <a
                      href={waLink(dep.claimedBy.userPhone, dep.claimedBy.userName, dep.spotNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm"
                      style={{ background: '#25d366', color: 'white', fontWeight: 700 }}
                    >
                      {`Message ${firstName(dep.claimedBy.userName)} on WhatsApp`}
                    </a>
                  )}
                  {dep.claimedBy?.userEmail && (
                    <a
                      href={teamsChatLink(
                        dep.claimedBy.userEmail,
                        'Hi ' + dep.claimedBy.userName + '! Thanks for claiming spot ' + dep.spotNumber + '. I will update you when I leave.'
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-teams"
                    >
                      {`Message ${firstName(dep.claimedBy.userName)} on Teams`}
                    </a>
                  )}
                </div>
                {renderChat(dep, posterChatInput, setPosterChatInput)}
              </>
            ) : (
              <>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: 8 }}>
                  Waiting for someone to claim your spot. Share ChargePass with your team!
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDelay(5)} disabled={delaying || (dep.delayExtensions || 0) >= 2}>
                    {delaying ? '...' : 'Running late +5'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDelay(10)} disabled={delaying || (dep.delayExtensions || 0) >= 2}>
                    +10
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDelay(15)} disabled={delaying || (dep.delayExtensions || 0) >= 2}>
                    +15
                  </button>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
                  {(dep.delayExtensions || 0) >= 2
                    ? 'Maximum ETA extensions reached for this post.'
                    : `ETA updates left: ${2 - (dep.delayExtensions || 0)} · Watchers are notified with no credit charge.`}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>
            <p style={{ marginBottom: 10 }}>No active departure post.</p>
            <a href="/" className="btn btn-outline btn-sm">Go to Spots</a>
          </div>
        )}
      </div>

      <div>
        <div className="section-title">Completed Handoffs ({completed.length})</div>
        {completed.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 20 }}>
            <p>No completed handoffs yet.</p>
            <p style={{ fontSize: '0.8rem', marginTop: 6 }}>Post your next departure to earn credits!</p>
          </div>
        ) : (
          <div className="spots-list">
            {completed.map(h => (
              <div key={h.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="spot-number" style={{ fontSize: '1.1rem', padding: '3px 10px' }}>{h.spotNumber}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        to {(h.claimedBy && h.claimedBy.userName) || 'Unknown'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {new Date(h.completedAt).toLocaleDateString('en-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <span className="credits-badge">+{h.creditsEarned || 3} pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="section-title">Notification History ({notificationHistory.length})</div>
        {(() => {
          const items = notificationHistory.map(n => ({
            id: n.id,
            title: n.status === 'completed'
              ? `Spot ${n.spotNumber} completed`
              : `Spot ${n.spotNumber} updated`,
            message: n.status === 'completed'
              ? `Claimed by ${n.claimedBy?.userName || 'Unknown'}`
              : `${n.userName} posted a spot`,
            timestamp: n.completedAt || n.postedAt
          }))
          return items.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 16 }}>
              No notifications yet.
            </div>
          ) : (
            <div className="spots-list">
              {items.map(n => (
                <div key={n.id} className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{n.title}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{n.message}</div>
                  {n.timestamp && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                      {new Date(n.timestamp).toLocaleString('en-IL')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
