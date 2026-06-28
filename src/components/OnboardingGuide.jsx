import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = [
  {
    title: 'Welcome to ChargePass',
    text: 'Quick 30-second walkthrough before first use. Tabs are right below the app name at the top.'
  },
  {
    title: 'Spots tab',
    text: 'View available charging spots and claim one with a single tap.',
    path: '/'
  },
  {
    title: 'My Activity tab',
    text: 'Track your active post, claimed spots, and handoff confirmations. You can also use in-app chat with the other driver here.',
    path: '/my-activity'
  },
  {
    title: 'In-app handoff chat',
    text: 'After a spot is claimed, poster and claimer can chat inside the app. Press Enter or tap Send to send a message.',
    path: '/my-activity'
  },
  {
    title: 'Leaderboard tab',
    text: 'See top contributors based on successful handoffs and credits.',
    path: '/leaderboard'
  },
  {
    title: 'Profile',
    text: 'Update your contact details and share your invite link.',
    path: '/profile'
  }
]

export default function OnboardingGuide({ onFinish }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progressText = useMemo(() => `${step + 1}/${STEPS.length}`, [step])

  function goToCurrentSection() {
    if (current.path) navigate(current.path)
  }

  return (
    <div className="guide-overlay" role="dialog" aria-modal="true">
      <div className="guide-card">
        <div className="guide-progress">{progressText}</div>
        <h3 className="guide-title">{current.title}</h3>
        <p className="guide-text">{current.text}</p>

        <div className="guide-actions">
          <button className="btn btn-secondary btn-sm" onClick={onFinish}>Skip</button>
          {step > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          {current.path && (
            <button className="btn btn-outline btn-sm" onClick={goToCurrentSection}>Show me</button>
          )}
          {!isLast ? (
            <button className="btn btn-primary btn-sm" onClick={() => setStep(s => s + 1)}>Next</button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onFinish}>Start using app</button>
          )}
        </div>
      </div>
    </div>
  )
}
