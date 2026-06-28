import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'crypto'
import webpush from 'web-push'

// WhatsApp via Twilio (fires if env vars are set; silent otherwise)
async function sendWhatsAppNotifications(posterName, spotNumber, etaMinutes, notifyUsers) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
  if (!sid || !token) return
  try {
    const twilio = require('twilio')(sid, token)
    const msg = `ChargePass Alert\n${posterName} is leaving spot ${spotNumber} in ~${etaMinutes} min. Open ChargePass to claim it!`
    await Promise.allSettled(
      notifyUsers.filter(u => u.phoneNumber).map(u =>
        twilio.messages.create({ from, to: `whatsapp:+${u.phoneNumber}`, body: msg })
          .then(m => console.log('[WhatsApp] Sent to', u.phoneNumber, m.sid))
          .catch(e => console.warn('[WhatsApp] Failed to', u.phoneNumber, e.message))
      )
    )
  } catch (e) {
    console.warn('[WhatsApp] Twilio error:', e.message)
  }
}


const DEMO_USERS = [
  { userId: 'u1', userName: 'Omri Ben-Lulu', userEmail: 'omribell@microsoft.com' },
  { userId: 'u2', userName: 'Dana Cohen',    userEmail: 'dana.cohen@microsoft.com' },
  { userId: 'u3', userName: 'Yoni Levi',     userEmail: 'yoni.levi@microsoft.com' },
  { userId: 'u4', userName: 'Shira Mizrahi', userEmail: 'shira.m@microsoft.com' },
  { userId: 'u5', userName: 'Nadav Bar',     userEmail: 'nadav.bar@microsoft.com' },
]

const now = Date.now()

const departures = [
  {
    id: 'd-seed-1',
    userId: 'u2', userName: 'Dana Cohen', userEmail: 'dana.cohen@microsoft.com',
    posterPhone: '972522222222',
    spotNumber: '5248', etaMinutes: 10, status: 'available',
    postedAt: new Date(now - 5 * 60000).toISOString(),
    confirmedDeadline: new Date(now + 25 * 60000).toISOString(),
    claimedBy: null, completedAt: null, creditsEarned: null, chatMessages: []
  },
  {
    id: 'd-seed-2',
    userId: 'u3', userName: 'Yoni Levi', userEmail: 'yoni.levi@microsoft.com',
    posterPhone: '972543333333',
    spotNumber: '3110', etaMinutes: 20, status: 'available',
    postedAt: new Date(now - 2 * 60000).toISOString(),
    confirmedDeadline: new Date(now + 38 * 60000).toISOString(),
    claimedBy: null, completedAt: null, creditsEarned: null, chatMessages: []
  }
]

const users = {
  u1: { id:'u1', userId:'u1', userName:'Omri Ben-Lulu', userEmail:'omribell@microsoft.com', phoneNumber:'972501111111', licensePlate:'12-345-67', credits:15, totalHandoffs:3, lastPostDate:null, notifyMe:false, registeredAt:new Date(now - 10 * 86400000).toISOString(), invitedBy:null, referralRewarded:false, onboardingSeen:true },
  u2: { id:'u2', userId:'u2', userName:'Dana Cohen', userEmail:'dana.cohen@microsoft.com', phoneNumber:'972522222222', licensePlate:'23-456-78', credits:10, totalHandoffs:2, lastPostDate:null, notifyMe:false, registeredAt:new Date(now - 9 * 86400000).toISOString(), invitedBy:null, referralRewarded:false, onboardingSeen:true },
  u3: { id:'u3', userId:'u3', userName:'Yoni Levi', userEmail:'yoni.levi@microsoft.com', phoneNumber:'972543333333', licensePlate:'34-567-89', credits:5, totalHandoffs:1, lastPostDate:null, notifyMe:false, registeredAt:new Date(now - 8 * 86400000).toISOString(), invitedBy:null, referralRewarded:false, onboardingSeen:true },
  u4: { id:'u4', userId:'u4', userName:'Shira Mizrahi', userEmail:'shira.m@microsoft.com', phoneNumber:null, licensePlate:null, credits:0, totalHandoffs:0, lastPostDate:null, notifyMe:false, registeredAt:null, invitedBy:null, referralRewarded:false, onboardingSeen:false },
  u5: { id:'u5', userId:'u5', userName:'Nadav Bar', userEmail:'nadav.bar@microsoft.com', phoneNumber:null, licensePlate:null, credits:0, totalHandoffs:0, lastPostDate:null, notifyMe:false, registeredAt:null, invitedBy:null, referralRewarded:false, onboardingSeen:false },
}

const notificationsByUser = {}

const FLOOR_SPOT_RANGES = [
  { floor: '-5', start: 5262, end: 5246 },
  { floor: '-4', start: 4137, end: 4121 },
  { floor: '-3', start: 3119, end: 3103 },
  { floor: '-2', start: 2040, end: 2054 },
]
const ALLOWED_DELAY_MINUTES = new Set([5, 10, 15])
const MAX_DELAY_EXTENSIONS = 2
const ENABLE_TEAMS_BATCH_NOTIFICATIONS = process.env.CHARGEPASS_TEAMS_BATCH === '1'
const ENABLE_WHATSAPP_BATCH_NOTIFICATIONS = process.env.CHARGEPASS_WHATSAPP_BATCH === '1'
const DEMO_VAPID_KEYS = webpush.generateVAPIDKeys()
const VAPID_PUBLIC_KEY = process.env.CHARGEPASS_VAPID_PUBLIC_KEY || DEMO_VAPID_KEYS.publicKey
const VAPID_PRIVATE_KEY = process.env.CHARGEPASS_VAPID_PRIVATE_KEY || DEMO_VAPID_KEYS.privateKey
const VAPID_SUBJECT = process.env.CHARGEPASS_VAPID_SUBJECT || 'mailto:chargepass-demo@microsoft.com'
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
const pushSubscriptionsByUser = {}

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

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'User'
}

function getDepartureTimestamp(dep) {
  return new Date(dep.postedAt).getTime() + (dep.etaMinutes * 60000)
}

function canAccessDepartureChat(dep, uid) {
  return dep.userId === uid || dep.claimedBy?.userId === uid
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers.host || 'localhost:5173'
  return `${proto}://${host}`
}

function externalChannelsForUser(user) {
  const channels = []
  if (ENABLE_TEAMS_BATCH_NOTIFICATIONS && user?.userEmail) channels.push('teams')
  if (ENABLE_WHATSAPP_BATCH_NOTIFICATIONS && user?.phoneNumber) channels.push('whatsapp')
  return channels
}

function activeSpotRows() {
  return departures
    .filter(d => d.status === 'available' || d.status === 'claimed')
    .map(d => ({
      spotNumber: d.spotNumber,
      status: d.status,
      userId: d.userId
    }))
}

function pushNotification(userId, payload) {
  if (!notificationsByUser[userId]) notificationsByUser[userId] = []
  notificationsByUser[userId].push({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    read: false,
    ...payload
  })
  const subs = pushSubscriptionsByUser[userId] || []
  if (!subs.length) return
  const title = payload.title || 'ChargePass'
  const body = payload.message || 'You have a new update.'
  const notificationPayload = JSON.stringify({
    title,
    body,
    url: payload.departureId ? '/my-activity' : '/',
    tag: payload.type || 'chargepass'
  })
  Promise.allSettled(subs.map(sub => webpush.sendNotification(sub, notificationPayload)))
    .then(results => {
      pushSubscriptionsByUser[userId] = subs.filter((_, i) => results[i].status === 'fulfilled')
    })
    .catch(() => {})
}

function checkReminderNotifications() {
  const nowTs = Date.now()
  departures.forEach(dep => {
    if (dep.completedAt || dep.status === 'completed' || dep.status === 'cancelled' || dep.status === 'expired') return
    const departureTs = getDepartureTimestamp(dep)

    if (!dep.lateReminderSent && nowTs >= departureTs + (10 * 60000)) {
      pushNotification(dep.userId, {
        type: 'late-reminder-poster',
        title: 'Still leaving soon?',
        message: `You are past your ETA for spot ${dep.spotNumber}. Update ETA or cancel this post.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      dep.lateReminderSent = true
    }

    if (!dep.autoCancelled && nowTs >= departureTs + (20 * 60000)) {
      dep.status = 'cancelled'
      dep.autoCancelled = true
      dep.autoCancelledAt = new Date().toISOString()
      pushNotification(dep.userId, {
        type: 'post-auto-cancelled',
        title: 'Post auto-cancelled',
        message: `Your post for spot ${dep.spotNumber} was removed because ETA passed without update.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      if (dep.claimedBy?.userId) {
        pushNotification(dep.claimedBy.userId, {
          type: 'claimed-post-auto-cancelled',
          title: 'Claim cancelled',
          message: `${firstName(dep.userName)} did not update ETA in time. Spot ${dep.spotNumber} was removed from feed.`,
          departureId: dep.id,
          spotNumber: dep.spotNumber
        })
      }
      return
    }

    if (dep.status !== 'claimed') return

    if (!dep.reminderClaimerSent && dep.claimedBy?.userId && nowTs >= departureTs + (25 * 60000)) {
      pushNotification(dep.claimedBy.userId, {
        type: 'reminder-claimer',
        title: 'Did you end up getting the spot?',
        message: `Don't forget to approve handoff so ${firstName(dep.userName)} receives their credits.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      dep.reminderClaimerSent = true
    }

    if (!dep.reminderPosterSent && nowTs >= departureTs + (30 * 60000)) {
      pushNotification(dep.userId, {
        type: 'reminder-poster',
        title: 'Did you hand over the spot?',
        message: `Don't forget to ping ${dep.claimedBy?.userName ? firstName(dep.claimedBy.userName) : 'the claimer'} to approve handoff so you receive your credits.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      dep.reminderPosterSent = true
    }
  })
}

function parseBody(req) {
  return new Promise(resolve => {
    let raw = ''
    req.on('data', c => raw += c)
    req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
  })
}

function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return m ? m[1] : null
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function getActiveUser(req) {
  const uid  = getCookie(req, 'demo_user') || 'u1'
  const info = DEMO_USERS.find(u => u.userId === uid) || DEMO_USERS[0]
  if (!users[info.userId]) {
    users[info.userId] = { id: info.userId, userId: info.userId, userName: info.userName, userEmail: info.userEmail, phoneNumber: null, licensePlate: null, credits: 0, totalHandoffs: 0, lastPostDate: null, notifyMe: false, registeredAt: null, invitedBy: null, referralRewarded: false, onboardingSeen: false }
  }
  return info
}

function markExpiredDepartures() {
  departures.forEach(d => {
    if (d.status === 'claimed' && new Date(d.confirmedDeadline) < new Date()) d.status = 'expired'
  })
}

function mockMiddleware(req, res, next) {
  const url    = new URL(req.url, 'http://localhost')
  const path   = url.pathname
  const method = req.method

  if (path === '/.auth/me') {
    const user = getActiveUser(req)
    return sendJSON(res, 200, {
      clientPrincipal: {
        identityProvider: 'aad', userId: user.userId,
        userDetails: user.userEmail, userRoles: ['authenticated'],
        claims: [{ typ: 'name', val: user.userName }]
      }
    })
  }

  if (path === '/.auth/switch' && method === 'POST') {
    parseBody(req).then(body => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `demo_user=${body.userId}; Path=/; SameSite=Lax` })
      res.end(JSON.stringify({ success: true }))
    })
    return
  }

  if (!path.startsWith('/api/')) return next()

  const userInfo = getActiveUser(req)
  const userId   = userInfo.userId
  const parts    = path.replace('/api/', '').split('/')
  checkReminderNotifications()

  if (method === 'POST' && parts[0] === 'me' && parts[1] === 'register') {
    parseBody(req).then(body => {
      if (!body.phoneNumber) return sendJSON(res, 400, { error: 'phoneNumber required' })
      if (!userInfo.userEmail.toLowerCase().endsWith('@microsoft.com')) {
        return sendJSON(res, 403, { error: 'Only @microsoft.com accounts can register.' })
      }
      const currentUser = users[userId]
      const isFirstRegistration = !currentUser.registeredAt
      users[userId].phoneNumber = body.phoneNumber.replace(/\D/g, '')
      users[userId].licensePlate = body.licensePlate ? String(body.licensePlate).toUpperCase() : null
      users[userId].registeredAt = users[userId].registeredAt || new Date().toISOString()
      if (isFirstRegistration) users[userId].onboardingSeen = false

      const inviteCode = (body.inviteCode || '').trim()
      if (isFirstRegistration && inviteCode && inviteCode !== userId && users[inviteCode] && !users[userId].referralRewarded) {
        users[userId].invitedBy = inviteCode
        users[userId].referralRewarded = true
        users[inviteCode].credits = (users[inviteCode].credits || 0) + 3
        pushNotification(inviteCode, {
          type: 'invite-reward',
          title: 'Invite reward earned',
          message: `${firstName(userInfo.userName)} joined with your invite link. You earned +3 credits.`,
          creditsAwarded: 3,
          invitedUserId: userId
        })
      }
      sendJSON(res, 200, { success: true })
    })
    return
  }

  if (method === 'PUT' && parts[0] === 'me' && parts[1] === 'profile') {
    parseBody(req).then(body => {
      const digits = (body.phoneNumber || '').replace(/\D/g, '')
      if (!digits) return sendJSON(res, 400, { error: 'phoneNumber required' })
      if (!userInfo.userEmail.toLowerCase().endsWith('@microsoft.com')) {
        return sendJSON(res, 403, { error: 'Only @microsoft.com accounts can update profile.' })
      }
      users[userId].phoneNumber = digits
      users[userId].licensePlate = body.licensePlate ? String(body.licensePlate).toUpperCase() : null
      return sendJSON(res, 200, { success: true })
    })
    return
  }

  if (method === 'POST' && parts[0] === 'me' && parts[1] === 'notify-me') {
    parseBody(req).then(body => {
      users[userId].notifyMe = !!body.enabled
      sendJSON(res, 200, { success: true, notifyMe: users[userId].notifyMe })
    })
    return
  }

  if (method === 'GET' && parts[0] === 'push' && parts[1] === 'public-key') {
    return sendJSON(res, 200, { publicKey: VAPID_PUBLIC_KEY })
  }

  if (method === 'POST' && parts[0] === 'me' && parts[1] === 'push-subscriptions') {
    return parseBody(req).then(body => {
      const sub = body.subscription
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return sendJSON(res, 400, { error: 'Invalid subscription' })
      }
      if (!pushSubscriptionsByUser[userId]) pushSubscriptionsByUser[userId] = []
      const exists = pushSubscriptionsByUser[userId].some(s => s.endpoint === sub.endpoint)
      if (!exists) pushSubscriptionsByUser[userId].push(sub)
      return sendJSON(res, 200, { success: true })
    })
  }

  if (method === 'DELETE' && parts[0] === 'me' && parts[1] === 'push-subscriptions') {
    return parseBody(req).then(body => {
      const endpoint = body.endpoint
      if (!endpoint) return sendJSON(res, 400, { error: 'endpoint required' })
      pushSubscriptionsByUser[userId] = (pushSubscriptionsByUser[userId] || []).filter(s => s.endpoint !== endpoint)
      return sendJSON(res, 200, { success: true })
    })
  }

  if (method === 'POST' && parts[0] === 'me' && parts[1] === 'onboarding-seen') {
    users[userId].onboardingSeen = true
    return sendJSON(res, 200, { success: true })
  }

  if (method === 'GET' && parts[0] === 'me' && parts[1] === 'notifications') {
    const rows = notificationsByUser[userId] || []
    const unread = rows.filter(n => !n.read)
    unread.forEach(n => { n.read = true })
    return sendJSON(res, 200, unread)
  }

  if (method === 'GET' && parts[0] === 'me' && parts[1] === 'notifications-history') {
    const rows = [...(notificationsByUser[userId] || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return sendJSON(res, 200, rows)
  }

  if (method === 'GET' && parts[0] === 'me' && !parts[1]) {
    const u = users[userId]
    const hasActiveClaim = departures.some(d => d.claimedBy && d.claimedBy.userId === userId && d.status === 'claimed')
    return sendJSON(res, 200, {
      userId,
      userName: userInfo.userName,
      userEmail: userInfo.userEmail,
      phoneNumber: u.phoneNumber,
      licensePlate: u.licensePlate,
      credits: u.credits,
      totalHandoffs: u.totalHandoffs,
      notifyMe: u.notifyMe,
      hasActiveClaim,
      onboardingSeen: !!u.onboardingSeen,
      browserPushEnabled: (pushSubscriptionsByUser[userId] || []).length > 0,
      inviteCode: userId,
      inviteLink: `${getBaseUrl(req)}/?invite=${encodeURIComponent(userId)}`
    })
  }

  if (method === 'GET' && parts[0] === 'me' && parts[1] === 'activity') {
    markExpiredDepartures()
    const u = users[userId]
    return sendJSON(res, 200, {
      credits: u.credits, totalHandoffs: u.totalHandoffs,
      activeDeparture:   departures.find(d => d.userId === userId && (d.status === 'available' || d.status === 'claimed')) ?? null,
      claimedSpot:       departures.find(d => d.claimedBy?.userId === userId && d.status === 'claimed') ?? null,
      completedHandoffs: departures.filter(d => d.userId === userId && d.status === 'completed')
    })
  }

  if (method === 'GET' && parts[0] === 'departures' && !parts[1]) {
    markExpiredDepartures()
    return sendJSON(res, 200, departures.filter(d => d.status === 'available'))
  }

  if (method === 'GET' && parts[0] === 'spots' && parts[1] === 'active') {
    markExpiredDepartures()
    return sendJSON(res, 200, activeSpotRows())
  }

  if (method === 'POST' && parts[0] === 'departures' && !parts[1]) {
    parseBody(req).then(body => {
      const u     = users[userId]
      const today = new Date().toISOString().split('T')[0]

      if (u.lastPostDate === today) {
        return sendJSON(res, 429, { error: "You've already posted today. You can post once per day to keep it fair for everyone." })
      }
      if (!body.spotNumber || !body.etaMinutes) {
        return sendJSON(res, 400, { error: 'spotNumber and etaMinutes required' })
      }
      if (!isValidChargingSpot(body.spotNumber)) {
        return sendJSON(res, 400, { error: 'Invalid charging spot number. Use approved campus charging spot ranges only.' })
      }
      departures.forEach(d => {
        if (d.userId === userId && (d.status === 'available' || d.status === 'claimed')) d.status = 'cancelled'
      })

      const postedAt          = new Date().toISOString()
      const confirmedDeadline = new Date(Date.now() + (Number(body.etaMinutes) + 20) * 60000).toISOString()

      const dep = {
        id: randomUUID(),
        userId, userName: userInfo.userName, userEmail: userInfo.userEmail,
        posterPhone: u.phoneNumber,
        spotNumber: normalizeSpotNumber(body.spotNumber),
        etaMinutes: Number(body.etaMinutes),
        status: 'available', postedAt, confirmedDeadline,
        claimedBy: null, completedAt: null, creditsEarned: null,
        delayExtensions: 0, lateReminderSent: false, autoCancelled: false,
        chatMessages: []
      }
      departures.push(dep)
      u.lastPostDate = today

      Object.values(users).forEach(other => {
        if (other.notifyMe && other.userId !== userId) {
          const externalChannels = externalChannelsForUser(other)
          const canChargeExternalBatch = externalChannels.length > 0 && other.credits > 0
          const creditCost = canChargeExternalBatch ? 1 : 0
          if (creditCost === 1) other.credits -= 1
          pushNotification(other.userId, {
            type: 'new-spot',
            title: 'New spot available',
            message: `${firstName(userInfo.userName)} posted spot ${dep.spotNumber} (~${dep.etaMinutes} min).`,
            departureId: dep.id,
            spotNumber: dep.spotNumber,
            posterName: userInfo.userName,
            posterPhone: u.phoneNumber,
            etaMinutes: dep.etaMinutes,
            creditCost,
            externalChannels
          })
        }
      })
      sendJSON(res, 201, dep)
    })
    return
  }

  const depId  = parts[1]
  const action = parts[2]

  if (parts[0] === 'departures' && depId) {
    const dep = departures.find(d => d.id === depId)

    if (action === 'ping' && method === 'POST') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (dep.userId === userId) return sendJSON(res, 400, { error: "You can't claim your own departure" })
      if (dep.status !== 'available') return sendJSON(res, 400, { error: 'This spot was just taken by someone else!' })
      dep.status    = 'claimed'
      dep.claimedBy = {
        userId,
        userName: userInfo.userName,
        userEmail: userInfo.userEmail,
        userPhone: users[userId]?.phoneNumber || null,
        userLicensePlate: users[userId]?.licensePlate || null
      }
      dep.chatMessages = dep.chatMessages || []
      dep.chatMessages.push({
        id: randomUUID(),
        senderUserId: 'system',
        senderName: 'System',
        message: `${firstName(userInfo.userName)} claimed this spot. You can now chat in-app.`,
        createdAt: new Date().toISOString()
      })
      pushNotification(dep.userId, {
        type: 'spot-claimed',
        title: 'Your spot was claimed',
        message: `${firstName(userInfo.userName)} claimed your spot ${dep.spotNumber}.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber,
        claimerName: userInfo.userName
      })
      return sendJSON(res, 200, {
        success: true,
        spotNumber: dep.spotNumber,
        posterName: dep.userName,
        posterPhone: dep.posterPhone,
        posterEmail: dep.userEmail
      })
    }

    if (action === 'confirm' && method === 'POST') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (dep.claimedBy?.userId !== userId) return sendJSON(res, 403, { error: 'Not your claimed spot' })
      dep.status = 'completed'
      dep.completedAt = new Date().toISOString()
      dep.creditsEarned = 3
      const leaver = users[dep.userId]
      if (leaver) { leaver.credits += 3; leaver.totalHandoffs += 1 }
      const claimerFirst = firstName(userInfo.userName)
      const posterFirst = firstName(dep.userName)
      pushNotification(dep.userId, {
        type: 'handoff-confirmed-poster',
        title: 'Handoff confirmed',
        message: `${claimerFirst} confirmed getting spot ${dep.spotNumber}. You earned +3 credits.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      pushNotification(userId, {
        type: 'handoff-confirmed-claimer',
        title: 'Handoff confirmed',
        message: `You confirmed handoff with ${posterFirst} for spot ${dep.spotNumber}.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      return sendJSON(res, 200, { success: true, creditsAwarded: 3 })
    }

    if (action === 'delay' && method === 'POST') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (dep.userId !== userId) return sendJSON(res, 403, { error: 'Not your departure' })
      if (dep.status !== 'available' && dep.status !== 'claimed') return sendJSON(res, 400, { error: 'Only active spots can be delayed' })
      return parseBody(req).then(body => {
        const addMinutes = Number(body.addMinutes)
        if (!ALLOWED_DELAY_MINUTES.has(addMinutes)) {
          return sendJSON(res, 400, { error: 'addMinutes must be 5, 10, or 15' })
        }
        if ((dep.delayExtensions || 0) >= MAX_DELAY_EXTENSIONS) {
          return sendJSON(res, 400, { error: 'Maximum ETA extensions reached for this post' })
        }

        dep.etaMinutes += addMinutes
        dep.delayExtensions = (dep.delayExtensions || 0) + 1
        dep.lastEtaUpdateAt = new Date().toISOString()
        dep.lateReminderSent = false
        dep.confirmedDeadline = new Date(getDepartureTimestamp(dep) + (20 * 60000)).toISOString()

        const posterFirst = firstName(dep.userName)
        Object.values(users).forEach(other => {
          if (other.userId === dep.userId) return
          if (!other.notifyMe) return
          pushNotification(other.userId, {
            type: 'eta-updated',
            title: 'ETA updated',
            message: `${posterFirst} delayed spot ${dep.spotNumber} by +${addMinutes} min (now ~${dep.etaMinutes} min).`,
            departureId: dep.id,
            spotNumber: dep.spotNumber,
            creditCost: 0
          })
        })

        if (dep.claimedBy?.userId) {
          pushNotification(dep.claimedBy.userId, {
            type: 'eta-updated-claimer',
            title: 'Poster is running late',
            message: `${posterFirst} delayed by +${addMinutes} min for spot ${dep.spotNumber}. Keep claim or release it.`,
            departureId: dep.id,
            spotNumber: dep.spotNumber,
            creditCost: 0
          })
        }
        return sendJSON(res, 200, { success: true, etaMinutes: dep.etaMinutes, delayExtensions: dep.delayExtensions })
      })
    }

    if (action === 'release-claim' && method === 'POST') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (dep.status !== 'claimed' || dep.claimedBy?.userId !== userId) {
        return sendJSON(res, 403, { error: 'Not your claimed spot' })
      }
      const claimerFirst = firstName(dep.claimedBy.userName)
      dep.status = 'available'
      dep.claimedBy = null
      dep.confirmedDeadline = new Date(getDepartureTimestamp(dep) + (20 * 60000)).toISOString()
      dep.reminderClaimerSent = false
      dep.reminderPosterSent = false

      pushNotification(dep.userId, {
        type: 'claim-released',
        title: 'Claim was released',
        message: `${claimerFirst} released claim for spot ${dep.spotNumber}. The spot is available again.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      pushNotification(userId, {
        type: 'claim-released-self',
        title: 'Claim released',
        message: `You released spot ${dep.spotNumber}.`,
        departureId: dep.id,
        spotNumber: dep.spotNumber
      })
      return sendJSON(res, 200, { success: true, reposted: true })
    }

    if (action === 'no-show' && method === 'POST') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (!dep.claimedBy || dep.claimedBy.userId !== userId) return sendJSON(res, 403, { error: 'Not your claimed spot' })
      const departureTime = new Date(dep.postedAt).getTime() + dep.etaMinutes * 60000
      const isPastDeparture = Date.now() > departureTime
      if (isPastDeparture) {
        dep.status = 'expired'
        return sendJSON(res, 200, { success: true, reposted: false })
      } else {
        const claimerFirst = firstName(dep.claimedBy?.userName)
        dep.status = 'available'
        pushNotification(dep.userId, {
          type: 'claimer-no-show',
          title: `${claimerFirst} didn't end up getting the spot`,
          message: `${claimerFirst} marked spot ${dep.spotNumber} as not received. Spot is back in the feed.`,
          departureId: dep.id,
          spotNumber: dep.spotNumber
        })
        dep.claimedBy = null
        return sendJSON(res, 200, { success: true, reposted: true })
      }
    }

    if (action === 'cancel' && method === 'POST') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (dep.userId !== userId) return sendJSON(res, 403, { error: 'Not your departure' })
      if (dep.status === 'claimed' && dep.claimedBy?.userId) {
        pushNotification(dep.claimedBy.userId, {
          type: 'spot-removed-after-claim',
          title: 'Spot removed from feed',
          message: `${firstName(userInfo.userName)} took this spot off the available spots.`,
          departureId: dep.id,
          spotNumber: dep.spotNumber
        })
      }
      dep.status = 'cancelled'
      return sendJSON(res, 200, { success: true })
    }

    if (action === 'chat' && method === 'GET') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (!canAccessDepartureChat(dep, userId)) return sendJSON(res, 403, { error: 'Not allowed' })
      return sendJSON(res, 200, { messages: dep.chatMessages || [] })
    }

    if (action === 'chat' && method === 'POST') {
      if (!dep) return sendJSON(res, 404, { error: 'Not found' })
      if (!dep.claimedBy?.userId) return sendJSON(res, 400, { error: 'Chat is available only after claim.' })
      if (!canAccessDepartureChat(dep, userId)) return sendJSON(res, 403, { error: 'Not allowed' })
      return parseBody(req).then(body => {
        const message = String(body.message || '').trim()
        if (!message) return sendJSON(res, 400, { error: 'message required' })
        if (message.length > 500) return sendJSON(res, 400, { error: 'message too long' })
        dep.chatMessages = dep.chatMessages || []
        const item = {
          id: randomUUID(),
          senderUserId: userId,
          senderName: userInfo.userName,
          message,
          createdAt: new Date().toISOString()
        }
        dep.chatMessages.push(item)
        const recipientId = userId === dep.userId ? dep.claimedBy.userId : dep.userId
        if (recipientId) {
          pushNotification(recipientId, {
            type: 'chat-message',
            title: 'New in-app message',
            message: `${firstName(userInfo.userName)} sent a message about spot ${dep.spotNumber}.`,
            departureId: dep.id,
            spotNumber: dep.spotNumber
          })
        }
        return sendJSON(res, 201, item)
      })
    }
  }

  if (method === 'GET' && parts[0] === 'leaderboard') {
    return sendJSON(res, 200,
      Object.values(users).filter(u => u.credits > 0).sort((a, b) => b.credits - a.credits).slice(0, 20)
    )
  }

  next()
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'chargepass-mock-api',
      configureServer(server) { server.middlewares.use(mockMiddleware) }
    }
  ]
})
