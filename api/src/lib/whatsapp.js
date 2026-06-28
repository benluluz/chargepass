'use strict'

/**
 * WhatsApp notification helper via Twilio.
 *
 * Setup (one-time):
 *  1. Sign up at https://www.twilio.com (free)
 *  2. Go to Messaging > Try it out > Send a WhatsApp message
 *  3. Each user joins the sandbox by texting "join <word>" to +1 415 523 8886
 *  4. Set env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *
 * For local dev: add these to api/local.settings.json
 * For Azure: add them in Static Web App → Configuration
 */

const SANDBOX_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

function getTwilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return require('twilio')(sid, token)
}

/**
 * Send a WhatsApp notification to a single phone number.
 * @param {string} toPhone  - E.164 digits only, e.g. "972501234567"
 * @param {string} message  - Plain text message body
 */
async function sendWhatsApp(toPhone, message) {
  const client = getTwilioClient()
  if (!client) {
    console.log('[WhatsApp] Twilio not configured — skipping. Message:', message)
    return null
  }
  try {
    const result = await client.messages.create({
      from: SANDBOX_FROM,
      to:   `whatsapp:+${toPhone}`,
      body: message
    })
    console.log('[WhatsApp] Sent to', toPhone, '— SID:', result.sid)
    return result.sid
  } catch (err) {
    console.warn('[WhatsApp] Failed to send to', toPhone, '—', err.message)
    return null
  }
}

/**
 * Notify all users who have notifyMe=true about a new departure.
 * @param {object[]} notifyUsers  - Array of { phoneNumber, userName }
 * @param {object}   departure    - { spotNumber, etaMinutes, userName (poster) }
 */
async function notifyWatchers(notifyUsers, departure) {
  if (!notifyUsers.length) return

  const message =
    `⚡ ChargePass Alert\n` +
    `${departure.userName} is leaving spot ${departure.spotNumber} in ~${departure.etaMinutes} min.\n` +
    `Open ChargePass to claim it!`

  await Promise.allSettled(
    notifyUsers
      .filter(u => u.phoneNumber)
      .map(u => sendWhatsApp(u.phoneNumber, message))
  )
}

module.exports = { sendWhatsApp, notifyWatchers }
