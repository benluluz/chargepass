'use strict'
const { app } = require('@azure/functions')
const cosmos = require('../lib/cosmos')

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

      if (!user.userEmail?.toLowerCase().endsWith('@microsoft.com')) {
        return { status: 403, jsonBody: { error: 'Only @microsoft.com accounts can register.' } }
      }
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
        onboardingSeen: existing?.onboardingSeen ?? false
      })
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

      if (!user.userEmail?.toLowerCase().endsWith('@microsoft.com')) {
        return { status: 403, jsonBody: { error: 'Only @microsoft.com accounts can update profile.' } }
      }
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
        onboardingSeen: existing?.onboardingSeen ?? false
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
      const { resources: claimed } = await cosmos.departuresContainer.items.query({
        query: 'SELECT * FROM c WHERE c.status = "claimed" AND c.claimedBy.userId = @uid OFFSET 0 LIMIT 1',
        parameters: [{ name: '@uid', value: user.userId }]
      }).fetchAll()
      const hasActiveClaim = claimed.length > 0
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
        onboardingSeen: true
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
