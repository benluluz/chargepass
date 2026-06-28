import { useEffect, useMemo, useState } from 'react'

const ETA_OPTIONS = [5, 10, 15, 30]
const FLOOR_SPOT_RANGES = [
  { floor: '-5', color: '#8c3849', start: 5262, end: 5246 },
  { floor: '-4', color: '#9e1613', start: 4137, end: 4121 },
  { floor: '-3', color: '#dcb400', start: 3119, end: 3103 },
  { floor: '-2', color: '#ccbd00', start: 2040, end: 2054 },
]

function normalizeSpotNumber(value) {
  return (value || '').replace(/\D/g, '')
}

function isValidChargingSpot(value) {
  const normalized = normalizeSpotNumber(value)
  if (normalized.length !== 4) return false
  const spot = Number(normalized)
  return FLOOR_SPOT_RANGES.some(r => {
    const min = Math.min(r.start, r.end)
    const max = Math.max(r.start, r.end)
    return spot >= min && spot <= max
  })
}

export default function PostDepartureModal({ onClose, onSuccess, onError }) {
  const [floor, setFloor] = useState(FLOOR_SPOT_RANGES[0].floor)
  const [spotNumber, setSpotNumber] = useState('')
  const [etaMinutes, setEtaMinutes] = useState(15)
  const [customEta, setCustomEta] = useState('')
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [activeSpots, setActiveSpots] = useState(new Set())

  const effectiveEta = customEta ? parseInt(customEta) : etaMinutes
  const selectedFloorMeta = FLOOR_SPOT_RANGES.find(f => f.floor === floor)
  const floorSpots = useMemo(() => {
    if (!selectedFloorMeta) return []
    const step = selectedFloorMeta.start <= selectedFloorMeta.end ? 1 : -1
    const result = []
    for (let n = selectedFloorMeta.start; step > 0 ? n <= selectedFloorMeta.end : n >= selectedFloorMeta.end; n += step) {
      result.push(String(n))
    }
    return result
  }, [selectedFloorMeta])

  useEffect(() => {
    fetch('/api/spots/active')
      .then(r => r.json())
      .then(rows => {
        if (!Array.isArray(rows)) return
        setActiveSpots(new Set(rows.map(x => normalizeSpotNumber(x.spotNumber))))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setSpotNumber('')
    setValidationError('')
  }, [floor])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!spotNumber.trim()) return
    if (!isValidChargingSpot(spotNumber)) {
      setValidationError('Please enter a valid charging spot number from the listed floor ranges.')
      return
    }
    setLoading(true)
    try {
      const normalizedSpot = normalizeSpotNumber(spotNumber)
      const res = await fetch('/api/departures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotNumber: normalizedSpot, etaMinutes: effectiveEta })
      })
      if (res.ok) {
        onSuccess()
      } else {
        const err = await res.json().catch(() => ({}))
        onError?.(err.error || 'Failed to post departure.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ pointerEvents: 'auto' }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2 className="modal-title">📍 Post Your Departure</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Floor</label>
            <select
              className="form-input"
              value={floor}
              onChange={e => setFloor(e.target.value)}
              style={{ fontWeight: 700 }}
            >
              {FLOOR_SPOT_RANGES.map(f => (
                <option key={f.floor} value={f.floor}>
                  {`Floor ${f.floor}`}
                </option>
              ))}
            </select>
            <p className="form-hint" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: selectedFloorMeta?.color }} />
              {`Floor ${floor} color`}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Charging Spot</label>
            <select
              className="form-input"
              value={spotNumber}
              onChange={e => { setSpotNumber(e.target.value); setValidationError('') }}
              required
              autoFocus
              style={{ fontSize: '1.05rem', fontWeight: 700 }}
            >
              <option value="">Select spot</option>
              {floorSpots.map(spot => {
                const disabled = activeSpots.has(spot)
                return (
                  <option key={spot} value={spot} disabled={disabled}>
                    {disabled ? `${spot} (busy)` : spot}
                  </option>
                )
              })}
            </select>
            <p className="form-hint">Busy spots are greyed out while actively posted or handed over.</p>
            {validationError && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 6 }}>{validationError}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Leaving in approximately...</label>
            <div className="eta-grid">
              {ETA_OPTIONS.map(eta => (
                <div
                  key={eta}
                  className={`eta-chip ${etaMinutes === eta && !customEta ? 'selected' : ''}`}
                  onClick={() => { setEtaMinutes(eta); setCustomEta('') }}
                >
                  {eta} min
                </div>
              ))}
            </div>
            <input
              className="form-input"
              type="number"
              placeholder="Or enter custom minutes..."
              value={customEta}
              onChange={e => setCustomEta(e.target.value)}
              min={1}
              max={120}
              style={{ textAlign: 'center' }}
            />
          </div>

          <div style={{ background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: '0.825rem', color: 'var(--color-primary-dark)', marginBottom: 4 }}>
            🎯 You'll earn <strong>+3 credits</strong> when someone confirms they got your spot!
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !spotNumber.trim() || activeSpots.has(spotNumber)}>
              {loading ? '⏳ Posting...' : '🚗 Post Departure'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
