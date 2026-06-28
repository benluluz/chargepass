const DEMO_USERS = [
  { userId: 'u1', userName: 'Omri Ben-Lulu',  role: 'You (presenter)' },
  { userId: 'u2', userName: 'Dana Cohen',     role: 'Colleague A' },
  { userId: 'u3', userName: 'Yoni Levi',      role: 'Colleague B' },
  { userId: 'u4', userName: 'Shira Mizrahi',  role: 'Colleague C' },
  { userId: 'u5', userName: 'Nadav Bar',      role: 'New user (registration demo)' },
]

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? match[1] : null
}

export default function DemoSwitcher() {
  const current = getCookie('demo_user') || 'u1'

  async function switchUser(userId) {
    await fetch('/.auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    })
    window.location.reload()
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      background: '#1e293b',
      color: '#94a3b8',
      fontSize: '0.75rem',
      padding: '6px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      zIndex: 999,
      flexWrap: 'wrap'
    }}>
      <span style={{ color: '#facc15', fontWeight: 700 }}>🎬 DEMO</span>
      <span>Switch user:</span>
      {DEMO_USERS.map(u => (
        <button
          key={u.userId}
          onClick={() => switchUser(u.userId)}
          style={{
            padding: '3px 10px',
            borderRadius: 99,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: u.userId === current ? '#16a34a' : '#334155',
            color: u.userId === current ? 'white' : '#94a3b8',
            transition: 'all 0.15s'
          }}
        >
          {u.userId === current ? '✓ ' : ''}{u.userName}
        </button>
      ))}
      <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.7rem' }}>
        Note on screen: switch users to demo full handoff flow
      </span>
    </div>
  )
}
