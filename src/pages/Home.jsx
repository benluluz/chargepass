import { useState, useEffect, useCallback } from 'react'
import SpotCard from '../components/SpotCard'
import PostDepartureModal from '../components/PostDepartureModal'
import useApi from '../hooks/useApi'

export default function Home({ user, onSpotClaimed }) {
  const { get, post, loading } = useApi()
  const [departures, setDepartures]         = useState([])
  const [me, setMe]                         = useState(null)
  const [showModal, setShowModal]           = useState(false)
  const [postError, setPostError]           = useState('')
  const [togglingNotify, setTogglingNotify] = useState(false)

  const loadData = useCallback(async () => {
    const [deps, meData] = await Promise.all([
      get('/api/departures'),
      get('/api/me')
    ])
    if (deps)           setDepartures(deps)
    if (meData)         setMe(meData)
  }, [get])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    const t = setInterval(loadData, 20000)
    return () => clearInterval(t)
  }, [loadData])

  async function toggleNotifyMe() {
    if (!me) return
    setTogglingNotify(true)
    const res = await post('/api/me/notify-me', { enabled: !me.notifyMe })
    setTogglingNotify(false)
    if (res) setMe(prev => ({ ...prev, notifyMe: !prev.notifyMe }))
  }

  const myActive = departures.find(d => d.userId === user?.userId)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Available Spots</h1>
          <p className="page-subtitle">
            {loading && departures.length === 0 ? 'Loading...' : departures.length + ' spot' + (departures.length !== 1 ? 's' : '') + ' available'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {me?.credits !== undefined && <span className="credits-badge">&#9889; {me.credits} pts</span>}
          {!myActive && (
            <button className="btn btn-primary btn-sm" onClick={() => { setPostError(''); setShowModal(true) }}>
              + I am Leaving
            </button>
          )}
        </div>
      </div>

      {me && (
        <div style={{
          background: me.notifyMe ? 'var(--color-primary-light)' : 'var(--color-surface)',
          border: '1.5px solid ' + (me.notifyMe ? 'var(--color-primary)' : 'var(--color-border)'),
          borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: '1.5rem' }}>&#128276;</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {me.notifyMe ? 'Notifications ON' : 'Notify me when someone posts'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {me.notifyMe
                ? 'In-app alerts are free. External Teams/WhatsApp batch alerts cost 1 credit per alert event.'
                : 'Enable alerts. In-app notifications are free.'}
            </div>
          </div>
          <button
            className={'btn btn-sm ' + (me.notifyMe ? 'btn-danger' : 'btn-primary')}
            onClick={toggleNotifyMe}
            disabled={togglingNotify}
          >
            {togglingNotify ? '...' : me.notifyMe ? 'Turn off' : 'Enable'}
          </button>
        </div>
      )}

      {myActive && (
        <div style={{ background: 'var(--color-primary-light)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--color-primary-dark)', display: 'flex', gap: 8 }}>
          <span>&#128226;</span>
          <span>Your departure for <strong>{myActive.spotNumber}</strong> is live. You will earn +3 pts when the handoff is confirmed.</span>
        </div>
      )}

      {loading && departures.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}><div className="spinner" /></div>
      ) : departures.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#128267;</div>
          <h3>No spots available right now</h3>
          <p>Enable notifications above so you are first to know.<br />Or be the hero and share your spot!</p>
          <br />
          <button className="btn btn-primary" onClick={() => { setPostError(''); setShowModal(true) }}>
            + I am Leaving Soon
          </button>
        </div>
      ) : (
        <div className="spots-list">
          {departures.map(dep => (
            <SpotCard key={dep.id} departure={dep} currentUser={user} canClaim={!me?.hasActiveClaim} onClaim={onSpotClaimed} onRefresh={loadData} />
          ))}
        </div>
      )}

      {postError && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 'var(--radius)', padding: '12px 14px', marginTop: 12, fontSize: '0.875rem', color: '#991b1b', display: 'flex', gap: 8 }}>
          <span>&#9888;</span><span>{postError}</span>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        Auto-refreshes every 20 seconds
      </div>

      {showModal && (
        <PostDepartureModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData() }}
          onError={msg => { setShowModal(false); setPostError(msg) }}
        />
      )}
    </div>
  )
}
