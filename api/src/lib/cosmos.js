'use strict'
const nodeCrypto = require('node:crypto')
if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto
}
const { CosmosClient } = require('@azure/cosmos')
const { ClientSecretCredential } = require('@azure/identity')

const connectionString = process.env.COSMOS_CONNECTION_STRING || ''
const accountEndpoint = process.env.COSMOS_ACCOUNT_ENDPOINT || ''
const tenantId = process.env.COSMOS_TENANT_ID || ''
const clientId = process.env.COSMOS_CLIENT_ID || ''
const clientSecret = process.env.COSMOS_CLIENT_SECRET || ''
const aadScope = process.env.COSMOS_AAD_SCOPE || 'https://cosmos.azure.com/.default'
let client = null
let db = null
let departuresContainer = null
let usersContainer = null
let useMemoryStorage = false
let authMode = 'memory'

const memory = {
  departures: new Map(),
  users: new Map()
}

let initialized = false

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getQueryTextAndParams(queryOrSpec, options) {
  if (typeof queryOrSpec === 'string') {
    return { text: queryOrSpec, params: options?.parameters || [] }
  }
  return { text: queryOrSpec?.query || '', params: queryOrSpec?.parameters || [] }
}

function getParam(params, name) {
  return params.find(p => p.name === name)?.value
}

function applyLimit(rows, text) {
  const m = text.match(/\bLIMIT\s+(\d+)/i)
  if (!m) return rows
  const limit = Number(m[1])
  if (!Number.isFinite(limit)) return rows
  return rows.slice(0, limit)
}

function runMemoryQuery(containerName, queryOrSpec, options) {
  const { text, params } = getQueryTextAndParams(queryOrSpec, options)
  let rows = [...memory[containerName].values()].map(clone)
  const uid = getParam(params, '@uid')

  if (text.includes('c.status IN ("available", "claimed")')) {
    rows = rows.filter(r => r.status === 'available' || r.status === 'claimed')
  }
  if (text.includes('c.userId = @uid')) {
    rows = rows.filter(r => r.userId === uid)
  }
  if (text.includes('c.userId != @uid')) {
    rows = rows.filter(r => r.userId !== uid)
  }
  if (text.includes('c.status = "claimed"')) {
    rows = rows.filter(r => r.status === 'claimed')
  }
  if (text.includes('c.status = "completed"')) {
    rows = rows.filter(r => r.status === 'completed')
  }
  if (text.includes('c.claimedBy.userId = @uid')) {
    rows = rows.filter(r => r.claimedBy?.userId === uid)
  }
  if (text.includes('c.notifyMe = true')) {
    rows = rows.filter(r => r.notifyMe === true)
  }
  if (text.includes('c.credits > 0')) {
    rows = rows.filter(r => (r.credits || 0) > 0)
  }

  if (text.includes('ORDER BY c._ts DESC')) {
    rows = rows.sort((a, b) => (b._ts || 0) - (a._ts || 0))
  }
  if (text.includes('ORDER BY c.completedAt DESC')) {
    rows = rows.sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())
  }
  if (text.includes('ORDER BY c.credits DESC')) {
    rows = rows.sort((a, b) => (b.credits || 0) - (a.credits || 0))
  }

  rows = applyLimit(rows, text)

  if (text.startsWith('SELECT c.spotNumber')) {
    rows = rows.map(r => ({ spotNumber: r.spotNumber, status: r.status, userId: r.userId }))
  }

  return rows
}

function createMemoryContainer(name) {
  return {
    item: (id) => ({
      read: async () => {
        const doc = memory[name].get(id)
        if (!doc) throw new Error('NotFound')
        return { resource: clone(doc) }
      },
      replace: async (doc) => {
        const next = { ...doc, _ts: Math.floor(Date.now() / 1000) }
        memory[name].set(id, next)
        return { resource: clone(next) }
      }
    }),
    items: {
      create: async (doc) => {
        const next = { ...doc, _ts: Math.floor(Date.now() / 1000) }
        memory[name].set(doc.id, next)
        return { resource: clone(next) }
      },
      upsert: async (doc) => {
        const next = { ...doc, _ts: Math.floor(Date.now() / 1000) }
        memory[name].set(doc.id, next)
        return { resource: clone(next) }
      },
      query: (queryOrSpec, options) => ({
        fetchAll: async () => ({ resources: runMemoryQuery(name, queryOrSpec, options) })
      })
    }
  }
}

async function ensureInitialized() {
  if (initialized) return
  try {
    const hasAadCredentials = accountEndpoint && tenantId && clientId && clientSecret

    if (hasAadCredentials) {
      const aadCredentials = new ClientSecretCredential(tenantId, clientId, clientSecret)
      client = new CosmosClient({
        endpoint: accountEndpoint,
        aadCredentials,
        aadScope
      })
      authMode = 'aad-cosmos'
      db = client.database('chargepass')
      departuresContainer = db.container('departures')
      usersContainer = db.container('users')
    } else if (connectionString) {
      client = new CosmosClient(connectionString)
      authMode = 'key-cosmos'
      db = client.database('chargepass')
      departuresContainer = db.container('departures')
      usersContainer = db.container('users')
    } else {
      useMemoryStorage = true
      departuresContainer = createMemoryContainer('departures')
      usersContainer = createMemoryContainer('users')
      initialized = true
      return
    }

    if (!hasAadCredentials) {
      await client.databases.createIfNotExists({ id: 'chargepass' })
      await db.containers.createIfNotExists({
        id: 'departures',
        partitionKey: { paths: ['/id'] }
      })
      await db.containers.createIfNotExists({
        id: 'users',
        partitionKey: { paths: ['/id'] }
      })
    }
  } catch (e) {
    useMemoryStorage = true
    departuresContainer = createMemoryContainer('departures')
    usersContainer = createMemoryContainer('users')
    authMode = 'memory'
    console.warn('Cosmos unavailable, using in-memory storage for demo:', e.message)
  }

  initialized = true
}

/**
 * Extract user identity from SWA's x-ms-client-principal header.
 * Falls back to a dev user when running locally without SWA CLI.
 */
function getUserFromRequest(req) {
  const header = req.headers.get('x-ms-client-principal')
  if (!header) {
    // Local dev fallback — SWA CLI injects this automatically in real runs
    return { userId: 'dev-user-1', userName: 'Dev User', userEmail: 'dev@microsoft.com' }
  }
  const principal = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  const nameClaim = principal.claims?.find(c => c.typ === 'name' || c.typ === 'preferred_username')
  return {
    userId: principal.userId,
    userName: nameClaim?.val || principal.userDetails?.split('@')[0] || 'Microsoft Employee',
    userEmail: principal.userDetails
  }
}

module.exports = {
  get departuresContainer() {
    return departuresContainer
  },
  get usersContainer() {
    return usersContainer
  },
  ensureInitialized,
  getUserFromRequest,
  get storageMode() {
    return useMemoryStorage ? 'memory' : authMode
  }
}
