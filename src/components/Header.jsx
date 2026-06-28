import { NavLink } from 'react-router-dom'

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Header({ user, activityBadge, spotsBadge }) {
  const name = user?.claims?.find(c => c.typ === 'name')?.val || user?.userDetails || 'You'

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-logo">
          <span className="ms-logo" aria-hidden="true">
            <span className="ms-logo-square ms-red" />
            <span className="ms-logo-square ms-green" />
            <span className="ms-logo-square ms-blue" />
            <span className="ms-logo-square ms-yellow" />
          </span>
          <span>ChargePass Microsoft Herzliya</span>
        </div>
        <NavLink to="/profile" title="Open profile">
          <div className="user-avatar">{initials(name)}</div>
        </NavLink>
      </div>
      <nav className="header-nav">
        <NavLink to="/" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')} style={{ display: 'flex', alignItems: 'center', gap: 5 }} end>
          Spots
          {spotsBadge && (
            <span style={{ width: 8, height: 8, background: '#dc2626', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
          )}
        </NavLink>
        <NavLink to="/my-activity" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          My Activity
          {activityBadge && (
            <span style={{ width: 8, height: 8, background: '#dc2626', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
          )}
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          Leaderboard
        </NavLink>
      </nav>
    </header>
  )
}
