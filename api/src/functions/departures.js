'use strict'
const { app } = require('@azure/functions')
const cosmos = require('../lib/cosmos')
const { notifyWatchers } = require('../lib/whatsapp')

const FLOOR_SPOT_RANGES = [
  { floor: '-5', start: 5262, end: 5246 },
  { floor: '-4', start: 4137, end: 4121 },
  { floor: '-3', start: 3119, end: 3103 },
  { floor: '-2', start: 2040, end: 2054 }
]

function normalizeSpotNumber(value) {
  return (value || '').replace(/\D/g, '')
}

function isValidChargingSpot(value) {
  const normalized = normalizeSpotNumber(value)
  if (normalized.length !== 4) return false
  const spot = Number(normalized)
  return FLOOR_SPOT_RANGES.some(range => {
    const min = Math.min(range.start, range.end)
    const max = Math.max(range.start, range.end)
    return spot >= min && spot <= max
  })
}

// GET /api/departures — list all active departures
app.http('getDepartures', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'departures',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const { resources } = await cosmos.departuresContainer.items
        .query('SELECT * FROM c WHERE c.status IN ("available", "claimed") ORDER BY c._ts DESC')
        .fetchAll()
      return { jsonBody: resources }
    } catch (e) {
      ctx.error('getDepartures error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// GET /api/spots/active — list spots currently active (available/claimed) to disable in picker
app.http('getActiveSpots', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'spots/active',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const { resources } = await cosmos.departuresContainer.items
        .query('SELECT c.spotNumber, c.status, c.userId FROM c WHERE c.status IN ("available", "claimed")')
        .fetchAll()
      return { jsonBody: resources }
    } catch (e) {
      ctx.error('getActiveSpots error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// POST /api/departures — post a new departure
app.http('postDeparture', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'departures',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const body = await req.json()

      if (!body.spotNumber || !body.etaMinutes) {
        return { status: 400, jsonBody: { error: 'spotNumber and etaMinutes are required' } }
      }
      if (!isValidChargingSpot(body.spotNumber)) {
        return { status: 400, jsonBody: { error: 'Invalid charging spot number. Use approved campus charging spot ranges only.' } }
      }

      // Cancel any existing active departure for this user
      const { resources: existing } = await cosmos.departuresContainer.items
        .query({
          query: 'SELECT * FROM c WHERE c.userId = @uid AND c.status IN ("available", "claimed")',
          parameters: [{ name: '@uid', value: user.userId }]
        })
        .fetchAll()

      for (const dep of existing) {
        await cosmos.departuresContainer.item(dep.id, dep.id).replace({ ...dep, status: 'cancelled' })
      }

      const { resource: existingUser } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))

      // Upsert the user profile so leaderboard works from day one
      await cosmos.usersContainer.items.upsert({
        id: user.userId,
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        phoneNumber: existingUser?.phoneNumber ?? null,
        licensePlate: existingUser?.licensePlate ?? null,
        notifyMe: existingUser?.notifyMe ?? false,
        onboardingSeen: existingUser?.onboardingSeen ?? false,
        browserPushEnabled: existingUser?.browserPushEnabled ?? false,
        pushSubscriptions: existingUser?.pushSubscriptions ?? [],
        notifications: existingUser?.notifications ?? [],
        credits: existingUser?.credits ?? 0,
        totalHandoffs: existingUser?.totalHandoffs ?? 0
      })

      const postedAt = new Date().toISOString()
      const departure = {
        id: crypto.randomUUID(),
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        posterPhone: existingUser?.phoneNumber ?? null,
        spotNumber: normalizeSpotNumber(body.spotNumber),
        etaMinutes: Number(body.etaMinutes),
        status: 'available',
        postedAt,
        availableAt: postedAt,
        pings: [],
        delayExtensions: 0,
        handoffEvents: [],
        claimedBy: null,
        completedAt: null,
        creditsEarned: null
      }

      const { resource } = await cosmos.departuresContainer.items.create(departure)

      // Send WhatsApp notifications to all users who opted in (fire-and-forget)
      try {
        const { resources: allUsers } = await cosmos.usersContainer.items
          .query('SELECT * FROM c WHERE c.notifyMe = true AND c.userId != @uid',
            { parameters: [{ name: '@uid', value: user.userId }] })
          .fetchAll()
        if (allUsers.length) {
          notifyWatchers(allUsers, departure).catch(e => ctx.warn('WhatsApp notify error:', e.message))
        }
      } catch (e) {
        ctx.warn('Failed to fetch notify list:', e.message)
      }

      return { status: 201, jsonBody: resource }
    } catch (e) {
      ctx.error('postDeparture error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})
