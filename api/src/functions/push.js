'use strict'
const { app } = require('@azure/functions')
const webPush = require('web-push')
const cosmos = require('../lib/cosmos')

const vapidSubject = process.env.PUSH_VAPID_SUBJECT || process.env.VAPID_SUBJECT || 'mailto:chargepass@microsoft.com'
const configuredPublicKey = process.env.PUSH_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
const configuredPrivateKey = process.env.PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || ''
let generatedKeys = null

function getVapidKeys(ctx) {
  if (configuredPublicKey && configuredPrivateKey) {
    webPush.setVapidDetails(vapidSubject, configuredPublicKey, configuredPrivateKey)
    return { publicKey: configuredPublicKey, privateKey: configuredPrivateKey }
  }

  if (!generatedKeys) {
    generatedKeys = webPush.generateVAPIDKeys()
    ctx?.log?.('Push VAPID keys were not configured; generated an ephemeral key pair for this runtime.')
  }

  webPush.setVapidDetails(vapidSubject, generatedKeys.publicKey, generatedKeys.privateKey)
  return generatedKeys
}

app.http('getPushPublicKey', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'push/public-key',
  handler: async (_req, ctx) => {
    try {
      const { publicKey } = getVapidKeys(ctx)
      return { jsonBody: { publicKey } }
    } catch (e) {
      ctx.error('getPushPublicKey error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})

app.http('savePushSubscription', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'me/push-subscriptions',
  handler: async (req, ctx) => {
    try {
      await cosmos.ensureInitialized()
      const user = cosmos.getUserFromRequest(req)
      const body = await req.json()
      const subscription = body?.subscription

      if (!subscription?.endpoint) {
        return { status: 400, jsonBody: { error: 'subscription is required' } }
      }

      const { resource: existing } = await cosmos.usersContainer.item(user.userId, user.userId).read().catch(() => ({ resource: null }))
      const currentSubscriptions = Array.isArray(existing?.pushSubscriptions) ? existing.pushSubscriptions : []
      const nextSubscriptions = [
        ...currentSubscriptions.filter(item => item?.endpoint !== subscription.endpoint),
        subscription
      ]

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
        onboardingSeen: existing?.onboardingSeen ?? false,
        browserPushEnabled: true,
        pushSubscriptions: nextSubscriptions
      })

      return { jsonBody: { success: true, browserPushEnabled: true } }
    } catch (e) {
      ctx.error('savePushSubscription error:', e)
      return { status: 500, jsonBody: { error: e.message } }
    }
  }
})
