'use strict'
const { app } = require('@azure/functions')
const cosmos = require('../lib/cosmos')

const HANDOFF_CREDITS = 3

// POST /api/departures/{id}/ping — express interest in a spot
app.http('pingLeaver', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'departures/{id}/ping',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const id = req.params.id
      const user = cosmos.getUserFromRequest(req)
      const { resource: userRecord } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))

      const { resource: dep } = await cosmos.departuresContainer.item(id, id).read()
      if (!dep) return { status: 404, jsonBody: { error: 'Departure not found' } }
      if (dep.userId === user.userId) return { status: 400, jsonBody: { error: "You can't ping your own departure" } }
      if (dep.status === 'completed' || dep.status === 'cancelled') return { status: 400, jsonBody: { error: 'Departure is no longer active' } }
      if (dep.pings?.some(p => p.userId === user.userId)) return { status: 400, jsonBody: { error: 'Already pinged' } }
      const { resource: posterRecord } = await cosmos.usersContainer.item(dep.userId, dep.userId).read().catch(() => ({ resource: null }))

      const pings = [...(dep.pings || []), {
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        userPhone: userRecord?.phoneNumber ?? null,
        userLicensePlate: userRecord?.licensePlate ?? null,
        pinggedAt: new Date().toISOString()
      }]

      await cosmos.departuresContainer.item(id, id).replace({
        ...dep,
        status: 'claimed',
        claimedBy: {
          userId: user.userId,
          userName: user.userName,
          userEmail: user.userEmail,
          userPhone: userRecord?.phoneNumber ?? null,
          userLicensePlate: userRecord?.licensePlate ?? null
        },
        claimedAt: new Date().toISOString(),
        pings
      })
      return {
        jsonBody: {
          success: true,
          pingCount: pings.length,
          posterName: dep.userName,
          posterEmail: dep.userEmail,
          posterPhone: posterRecord?.phoneNumber ?? null,
          spotNumber: dep.spotNumber
        }
      }
    } catch (e) {
      ctx.error('pingLeaver error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// POST /api/departures/{id}/accept-ping — leaver chooses who gets their spot
app.http('acceptPing', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'departures/{id}/accept-ping',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const id = req.params.id
      const user = cosmos.getUserFromRequest(req)
      const body = await req.json()

      const { resource: dep } = await cosmos.departuresContainer.item(id, id).read()
      if (!dep) return { status: 404, jsonBody: { error: 'Departure not found' } }
      if (dep.userId !== user.userId) return { status: 403, jsonBody: { error: 'Only the departure owner can accept pings' } }
      if (dep.status !== 'available') return { status: 400, jsonBody: { error: 'Departure is not available' } }

      const ping = dep.pings?.find(p => p.userId === body.userId)
      if (!ping) return { status: 400, jsonBody: { error: 'Ping not found' } }

      await cosmos.departuresContainer.item(id, id).replace({
        ...dep,
        status: 'claimed',
        claimedBy: {
          userId: ping.userId,
          userName: ping.userName,
          userEmail: ping.userEmail,
          userPhone: ping.userPhone ?? null,
          userLicensePlate: ping.userLicensePlate ?? null
        }
      })
      return { jsonBody: { success: true } }
    } catch (e) {
      ctx.error('acceptPing error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// POST /api/departures/{id}/confirm — incoming driver confirms they got the spot
app.http('confirmHandoff', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'departures/{id}/confirm',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const id = req.params.id
      const user = cosmos.getUserFromRequest(req)

      const { resource: dep } = await cosmos.departuresContainer.item(id, id).read()
      if (!dep) return { status: 404, jsonBody: { error: 'Departure not found' } }
      if (dep.userId === user.userId) return { status: 400, jsonBody: { error: "You can't confirm your own departure" } }
      if (dep.status === 'completed') return { status: 400, jsonBody: { error: 'Already completed' } }

      // Authorisation: must be the accepted person, or any pinger if no one was accepted
      const isClaimedByMe = dep.claimedBy?.userId === user.userId
      const isPinger = dep.pings?.some(p => p.userId === user.userId)
      const hasNoClaim = !dep.claimedBy

      if (!isClaimedByMe && !(isPinger && hasNoClaim)) {
        return { status: 403, jsonBody: { error: 'You are not authorised to confirm this handoff' } }
      }

      const confirmedBy = dep.claimedBy || { userId: user.userId, userName: user.userName, userEmail: user.userEmail }

      await cosmos.departuresContainer.item(id, id).replace({
        ...dep,
        status: 'completed',
        completedAt: new Date().toISOString(),
        claimedBy: confirmedBy,
        creditsEarned: HANDOFF_CREDITS
      })

      // Award credits to the leaver
      try {
        const { resource: leaverRecord } = await cosmos.usersContainer.item(dep.userId, dep.userId).read()
        if (leaverRecord) {
          await cosmos.usersContainer.item(dep.userId, dep.userId).replace({
            ...leaverRecord,
            credits: (leaverRecord.credits || 0) + HANDOFF_CREDITS,
            totalHandoffs: (leaverRecord.totalHandoffs || 0) + 1
          })
        } else {
          await cosmos.usersContainer.items.upsert({
            id: dep.userId,
            userId: dep.userId,
            userName: dep.userName,
            userEmail: dep.userEmail,
            phoneNumber: null,
            licensePlate: null,
            credits: HANDOFF_CREDITS,
            totalHandoffs: 1,
            notifyMe: false,
            onboardingSeen: false,
            browserPushEnabled: false,
            pushSubscriptions: []
          })
        }
      } catch (creditErr) {
        // Credit award failure shouldn't fail the overall confirmation
        ctx.warn('Failed to award credits:', creditErr.message)
      }

      return { jsonBody: { success: true, creditsAwarded: HANDOFF_CREDITS } }
    } catch (e) {
      ctx.error('confirmHandoff error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// POST /api/departures/{id}/cancel — owner cancels their departure post
app.http('cancelDeparture', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'departures/{id}/cancel',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const id = req.params.id
      const user = cosmos.getUserFromRequest(req)

      const { resource: dep } = await cosmos.departuresContainer.item(id, id).read()
      if (!dep) return { status: 404, jsonBody: { error: 'Departure not found' } }
      if (dep.userId !== user.userId) return { status: 403, jsonBody: { error: 'Not your departure' } }

      await cosmos.departuresContainer.item(id, id).replace({ ...dep, status: 'cancelled' })
      return { jsonBody: { success: true } }
    } catch (e) {
      ctx.error('cancelDeparture error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// POST /api/departures/{id}/delay — extend ETA by specified minutes (max 2 updates)
app.http('delayDeparture', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'departures/{id}/delay',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const id = req.params.id
      const user = cosmos.getUserFromRequest(req)
      const body = await req.json()
      const delayMinutes = Number(body.delayMinutes ?? body.addMinutes)

      if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
        return { status: 400, jsonBody: { error: 'delayMinutes (number) is required' } }
      }

      const { resource: dep } = await cosmos.departuresContainer.item(id, id).read()
      if (!dep) return { status: 404, jsonBody: { error: 'Departure not found' } }
      if (dep.userId !== user.userId) return { status: 403, jsonBody: { error: 'Only the departure owner can delay' } }
      if (dep.status !== 'available' && dep.status !== 'claimed') {
        return { status: 400, jsonBody: { error: 'Departure is not active' } }
      }

      // Track number of updates via pings array (reuse for ETA tracking)
      const updates = dep.pings?.filter(p => p.isEtaUpdate) || []
      if (updates.length >= 2) {
        return { status: 400, jsonBody: { error: 'Maximum ETA updates (2) reached' } }
      }

      // Update ETA
      const newEta = dep.etaMinutes + delayMinutes
      const newPings = [
        ...(dep.pings || []),
        {
          isEtaUpdate: true,
          delayMinutes,
          newEta: newEta,
          updatedAt: new Date().toISOString()
        }
      ]

      await cosmos.departuresContainer.item(id, id).replace({
        ...dep,
        etaMinutes: newEta,
        pings: newPings
      })

      return { jsonBody: { success: true, newEta, updatesRemaining: 2 - (updates.length + 1) } }
    } catch (e) {
      ctx.error('delayDeparture error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})
