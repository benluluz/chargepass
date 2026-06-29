'use strict'
const { app } = require('@azure/functions')
const cosmos = require('../lib/cosmos')

function buildInviteLink(req, userId) {
  if (!userId) return null
  const originHeader = req.headers.get('origin')
  if (originHeader) {
    return `${originHeader.replace(/\/$/, '')}/?invite=${encodeURIComponent(userId)}`
  }

  const referer = req.headers.get('referer')
  if (referer) {
    try {
      return `${new URL(referer).origin}/?invite=${encodeURIComponent(userId)}`
    } catch {}
  }

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (!host) return null
  return `${proto}://${host}/?invite=${encodeURIComponent(userId)}`
}

// GET /api/health — lightweight probe for SWA/API/Cosmos diagnostics
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (_req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      return { jsonBody: { ok: true, storage: cosmos.storageMode } }
    } catch (e) {
      ctx.error('health error:', e)
      return { status: 500, jsonBody: { ok: false, error: e.message } }
    }
  }
})

// POST /api/me/register — save registration details for notifications/contact
app.http('registerMe', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'me/register',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const body = await req.json()
      const phone = (body.phoneNumber || '').replace(/\D/g, '')
      const licensePlate = body.licensePlate ? String(body.licensePlate).toUpperCase() : null
      const inviteCode = String(body.inviteCode || '').trim()

      if (!phone) {
        return { status: 400, jsonBody: { error: 'phoneNumber is required' } }
      }

      const { resource: existing } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))
      await cosmos.usersContainer.items.upsert({
        id: user.userId,
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        phoneNumber: phone,
        licensePlate,
        credits: existing?.credits ?? 0,
        totalHandoffs: existing?.totalHandoffs ?? 0,
        notifyMe: existing?.notifyMe ?? false,
        onboardingSeen: existing?.onboardingSeen ?? false,
        browserPushEnabled: existing?.browserPushEnabled ?? false,
        pushSubscriptions: existing?.pushSubscriptions ?? []
      })

      if (inviteCode && inviteCode !== user.userId) {
        const { resource: inviter } = await cosmos.usersContainer.item(inviteCode, inviteCode).read().catch(() => ({ resource: null }))
        if (inviter) {
          await cosmos.usersContainer.items.upsert({
            id: inviter.userId,
            userId: inviter.userId,
            userName: inviter.userName,
            userEmail: inviter.userEmail,
            phoneNumber: inviter.phoneNumber ?? null,
            licensePlate: inviter.licensePlate ?? null,
            credits: (inviter.credits ?? 0) + 3,
            totalHandoffs: inviter.totalHandoffs ?? 0,
            notifyMe: inviter.notifyMe ?? false,
            onboardingSeen: inviter.onboardingSeen ?? false,
            browserPushEnabled: inviter.browserPushEnabled ?? false,
            pushSubscriptions: inviter.pushSubscriptions ?? []
          })
        } else {
          ctx.warn('registerMe inviteCode not found:', inviteCode)
        }
      }
      return { jsonBody: { success: true } }
    } catch (e) {
      ctx.error('registerMe error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// PUT /api/me/profile — update profile details
app.http('updateMyProfile', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'me/profile',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const body = await req.json()
      const phone = (body.phoneNumber || '').replace(/\D/g, '')
      const licensePlate = body.licensePlate ? String(body.licensePlate).toUpperCase() : null

      if (!phone) {
        return { status: 400, jsonBody: { error: 'phoneNumber is required' } }
      }

      const { resource: existing } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))
      await cosmos.usersContainer.items.upsert({
        id: user.userId,
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        phoneNumber: phone,
        licensePlate,
        credits: existing?.credits ?? 0,
        totalHandoffs: existing?.totalHandoffs ?? 0,
        notifyMe: existing?.notifyMe ?? false,
        onboardingSeen: existing?.onboardingSeen ?? false,
        browserPushEnabled: existing?.browserPushEnabled ?? false,
        pushSubscriptions: existing?.pushSubscriptions ?? []
      })

      return { jsonBody: { success: true } }
    } catch (e) {
      ctx.error('updateMyProfile error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// GET /api/me — current user's profile and credits
app.http('getMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const { resource } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))
      const { resources: activeDeps } = await cosmos.departuresContainer.items.query({
        query: 'SELECT * FROM c WHERE c.status IN ("available", "claimed") ORDER BY c._ts DESC'
      }).fetchAll()
      const { resources: claimed } = await cosmos.departuresContainer.items.query({
        query: 'SELECT * FROM c WHERE c.status = "claimed" AND c.claimedBy.userId = @uid OFFSET 0 LIMIT 1',
        parameters: [{ name: '@uid', value: user.userId }]
      }).fetchAll()
      const hasActiveClaim = claimed.length > 0 || activeDeps.some(dep => dep.claimedBy?.userId === user.userId || dep.pings?.some(p => p.userId === user.userId))
      return {
        jsonBody: {
          userId: user.userId,
          userName: user.userName,
          userEmail: user.userEmail,
          phoneNumber: resource?.phoneNumber ?? null,
          licensePlate: resource?.licensePlate ?? null,
          credits: resource?.credits ?? 0,
          totalHandoffs: resource?.totalHandoffs ?? 0,
          notifyMe: resource?.notifyMe ?? false,
          onboardingSeen: resource?.onboardingSeen ?? false,
          browserPushEnabled: resource?.browserPushEnabled ?? false,
          inviteLink: buildInviteLink(req, user.userId),
          hasActiveClaim
        }
      }
    } catch (e) {
      ctx.error('getMe error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// POST /api/me/onboarding-seen — mark one-time walkthrough as completed
app.http('markOnboardingSeen', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'me/onboarding-seen',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const { resource: existing } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))
      await cosmos.usersContainer.items.upsert({
        id: user.userId,
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        phoneNumber: existing?.phoneNumber ?? null,
        licensePlate: existing?.licensePlate ?? null,
        credits: existing?.credits ?? 0,
        totalHandoffs: existing?.totalHandoffs ?? 0,
        notifyMe: existing?.notifyMe ?? false,
        onboardingSeen: true,
        browserPushEnabled: existing?.browserPushEnabled ?? false,
        pushSubscriptions: existing?.pushSubscriptions ?? []
      })
      return { jsonBody: { success: true } }
    } catch (e) {
      ctx.error('markOnboardingSeen error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// GET /api/me/activity — current user's active departure + completed handoffs
app.http('getMyActivity', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me/activity',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)

      const [
        { resource: userRecord },
        { resources: activeDeps },
        { resources: claimedDeps },
        { resources: completed }
      ] = await Promise.all([
        cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null })),
        cosmos.departuresContainer.items.query({
          query: 'SELECT * FROM c WHERE c.userId = @uid AND c.status IN ("available", "claimed")',
          parameters: [{ name: '@uid', value: user.userId }]
        }).fetchAll(),
        cosmos.departuresContainer.items.query({
          query: 'SELECT * FROM c WHERE c.status = "claimed" AND c.claimedBy.userId = @uid OFFSET 0 LIMIT 1',
          parameters: [{ name: '@uid', value: user.userId }]
        }).fetchAll(),
        cosmos.departuresContainer.items.query({
          query: 'SELECT * FROM c WHERE c.userId = @uid AND c.status = "completed" ORDER BY c.completedAt DESC',
          parameters: [{ name: '@uid', value: user.userId }]
        }).fetchAll()
      ])

      return {
        jsonBody: {
          credits: userRecord?.credits ?? 0,
          totalHandoffs: userRecord?.totalHandoffs ?? 0,
          activeDeparture: activeDeps[0] ?? null,
          claimedSpot: claimedDeps[0] ?? null,
          completedHandoffs: completed
        }
      }
    } catch (e) {
      ctx.error('getMyActivity error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// GET /api/leaderboard — top 20 users by credits
app.http('getLeaderboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'leaderboard',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const { resources } = await cosmos.usersContainer.items
        .query('SELECT * FROM c WHERE c.credits > 0 ORDER BY c.credits DESC OFFSET 0 LIMIT 20')
        .fetchAll()
      return { jsonBody: resources }
    } catch (e) {
      ctx.error('getLeaderboard error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// GET /api/me/notifications — current active departures (notification feed)
app.http('getMyNotifications', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me/notifications',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const [available, claimedMine, claimedForMe] = await Promise.all([
        cosmos.departuresContainer.items.query({
          query: 'SELECT * FROM c WHERE c.status = "available" AND c.userId != @uid ORDER BY c._ts DESC',
          parameters: [{ name: '@uid', value: user.userId }]
        }).fetchAll(),
        cosmos.departuresContainer.items.query({
          query: 'SELECT * FROM c WHERE c.status = "claimed" AND c.userId = @uid ORDER BY c._ts DESC',
          parameters: [{ name: '@uid', value: user.userId }]
        }).fetchAll(),
        cosmos.departuresContainer.items.query({
          query: 'SELECT * FROM c WHERE c.status = "claimed" AND c.claimedBy.userId = @uid ORDER BY c._ts DESC',
          parameters: [{ name: '@uid', value: user.userId }]
        }).fetchAll()
      ])

      const feed = [
        ...available.resources.map(dep => ({
          id: `available-${dep.id}`,
          kind: 'available',
          title: `New spot posted: ${dep.spotNumber}`,
          message: `${dep.userName} is leaving in ~${dep.etaMinutes} min`,
          url: '/?view=my-activity',
          timestamp: dep.postedAt,
          spotNumber: dep.spotNumber
        })),
        ...claimedMine.resources.map(dep => ({
          id: `claimed-${dep.id}`,
          kind: 'claimed',
          title: `Spot ${dep.spotNumber} is claimed`,
          message: `${dep.claimedBy?.userName || 'Someone'} is on the way`,
          url: '/?view=my-activity',
          timestamp: dep.claimedAt || dep.postedAt,
          spotNumber: dep.spotNumber
        }))
      ]

      const handoffs = [...claimedMine.resources, ...claimedForMe.resources]
      for (const dep of handoffs) {
        const isClaimer = dep.claimedBy?.userId === user.userId
        const delayUpdates = (dep.pings || []).filter(p => p.isEtaUpdate)
        if (isClaimer) {
          for (const upd of delayUpdates) {
            feed.push({
              id: `delay-${dep.id}-${upd.updatedAt || upd.newEta || upd.delayMinutes}`,
              kind: 'delay',
              title: `Spot ${dep.spotNumber} ETA updated`,
              message: `${dep.userName} is running late by +${upd.delayMinutes} min (new ETA ~${upd.newEta || dep.etaMinutes} min)`,
              url: '/?view=my-activity',
              timestamp: upd.updatedAt || dep.claimedAt || dep.postedAt,
              spotNumber: dep.spotNumber
            })
          }
        }

        const chatMessages = Array.isArray(dep.chatMessages) ? dep.chatMessages : []
        for (const msg of chatMessages) {
          if (!msg?.id || msg.senderUserId === user.userId || msg.senderUserId === 'system') continue
          const preview = String(msg.message || '').trim().slice(0, 120)
          if (!preview) continue
          feed.push({
            id: `chat-${dep.id}-${msg.id}`,
            kind: 'chat',
            title: `New message on spot ${dep.spotNumber}`,
            message: `${msg.senderName || 'Driver'}: ${preview}`,
            url: '/?view=my-activity',
            timestamp: msg.createdAt || dep.claimedAt || dep.postedAt,
            spotNumber: dep.spotNumber
          })
        }
      }

      feed.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())

      return {
        jsonBody: feed
      }
    } catch (e) {
      ctx.error('getMyNotifications error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// GET /api/me/notifications-history — past notifications (completed handoffs)
app.http('getNotificationsHistory', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me/notifications-history',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      
      // Get completed handoffs from other users (notification history)
      const { resources } = await cosmos.departuresContainer.items.query({
        query: 'SELECT * FROM c WHERE c.userId != @uid AND c.status = "completed" ORDER BY c.completedAt DESC OFFSET 0 LIMIT 50',
        parameters: [{ name: '@uid', value: user.userId }]
      }).fetchAll()
      
      return { jsonBody: resources }
    } catch (e) {
      ctx.error('getNotificationsHistory error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

// POST /api/me/notify-me — toggle notification preference
app.http('toggleNotifyMe', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'me/notify-me',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const body = await req.json()
      const enabled = Boolean(body?.enabled)

      const { resource: existing } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))
      await cosmos.usersContainer.items.upsert({
        id: user.userId,
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        phoneNumber: existing?.phoneNumber ?? null,
        licensePlate: existing?.licensePlate ?? null,
        credits: existing?.credits ?? 0,
        totalHandoffs: existing?.totalHandoffs ?? 0,
        notifyMe: enabled,
        onboardingSeen: existing?.onboardingSeen ?? false,
        browserPushEnabled: existing?.browserPushEnabled ?? false,
        pushSubscriptions: existing?.pushSubscriptions ?? []
      })

      return { jsonBody: { success: true, notifyMe: enabled } }
    } catch (e) {
      ctx.error('toggleNotifyMe error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})
