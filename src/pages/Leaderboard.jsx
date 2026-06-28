import { useState, useEffect } from 'react'
import useApi from '../hooks/useApi'

const RANK_EMOJI = ['🥇', '🥈', '🥉']

export default function Leaderboard({ user }) {
  const { get, loading } = useApi()
  const [leaders, setLeaders] = useState([])
  const [me, setMe] = useState(null)

  useEffect(() => {
    Promise.all([get('/api/leaderboard'), get('/api/me')]).then(([l, m]) => {
      if (l) setLeaders(l)
      if (m) setMe(m)
    })
  }, [get])

  const myRank = leaders.findIndex(l => l.userId === user?.userId) + 1

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-subtitle">Most generous chargers this month</p>
        </div>
      </div>

      {me && (
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-value">⚡ {me.credits}</div>
            <div className="stat-label">Your Credits</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{me.totalHandoffs}</div>
            <div className="stat-label">Handoffs</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{myRank > 0 ? `#${myRank}` : '—'}</div>
            <div className="stat-label">Your Rank</div>
          </div>
        </div>
      )}

      {loading && !leaders.length ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 32 }}><div className="spinner" /></div>
      ) : leaders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏆</div>
          <h3>Leaderboard is empty</h3>
          <p>Complete handoffs to earn credits and appear here!</p>
        </div>
      ) : (
        <div className="leaderboard-list">
          {leaders.map((entry, i) => (
            <div
              key={entry.userId}
              className={[
                'leaderboard-item',
                i < 3 ? `top-${i + 1}` : '',
                entry.userId === user?.userId ? 'me' : ''
              ].filter(Boolean).join(' ')}
            >
              <div className="leaderboard-rank">{RANK_EMOJI[i] || `#${i + 1}`}</div>
              <div className="user-avatar" style={{ width: 36, height: 36, fontSize: '0.875rem', flexShrink: 0 }}>
                {entry.userName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="leaderboard-name">
                {entry.userName}
                {entry.userId === user?.userId && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>(you)</span>
                )}
              </div>
              <div className="leaderboard-score">
                <div className="leaderboard-score-value">⚡ {entry.credits}</div>
                <div className="leaderboard-score-label">{entry.totalHandoffs} handoff{entry.totalHandoffs !== 1 ? 's' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 24, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderColor: 'var(--color-primary)' }}>
        <h3 style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.95rem' }}>How the credit system works</h3>
        <ul style={{ fontSize: '0.85rem', color: 'var(--color-text)', paddingLeft: 18, lineHeight: 2 }}>
          <li>Post your departure: earns goodwill 😊</li>
          <li>Successful handoff confirmed by incoming driver: <strong>+3 credits ⚡</strong></li>
          <li>Turn on notifications to get alerted when someone posts — costs 1 credit per alert</li>
          <li>Everyone with notifications ON is notified at the same time — no priority queue</li>
          <li>Credits reset monthly — stay active!</li>
        </ul>
      </div>
    </div>
  )
}
