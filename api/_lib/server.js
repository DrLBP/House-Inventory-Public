// Shared helpers for our Vercel server functions (the files in /api).
// These run on Vercel's servers, NOT on the phone, so they can safely use
// secret settings. Folders/files starting with "_" are not web addresses.
//
// Secret settings used here (set in Vercel -> Settings -> Environment Variables).
// None of them start with VITE_, so they are never sent to the browser:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  - from Google Cloud
//   SUPABASE_SECRET_KEY                     - from Supabase (full database access!)
//   APP_SECRET                              - a long random password we made up
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// The only Google permissions we ask for:
//   drive.file   = see/change ONLY files this app created (not the rest of Drive)
//   openid email = learn which Google account was connected (to show it on screen)
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file']
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

// An error that carries the HTTP status code to send back.
export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Read a setting; stop with a clear message if it's missing.
export function env(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new HttpError(500, `Server setting ${name} is missing in Vercel`)
  return value
}

// Supabase connection with FULL access (bypasses row-level security).
// Only ever used inside these server functions.
export function supabaseAdmin() {
  const url = new URL(env('VITE_SUPABASE_URL')).origin
  return createClient(url, env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Check the "Authorization: Bearer <login token>" sent by the app and
// return the logged-in Supabase user. Rejects anyone not logged in.
export async function requireUser(req, admin) {
  const header = req.headers.authorization || ''
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!jwt) throw new HttpError(401, 'Not logged in')
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data?.user) throw new HttpError(401, 'Not logged in')
  return data.user
}

// Two separate keys are derived from APP_SECRET: one for encrypting, one for signing.
function derivedKey(purpose) {
  return crypto.createHash('sha256').update(`${purpose}:${env('APP_SECRET')}`).digest()
}

// Encrypt text with AES-256-GCM (a standard, strong encryption method).
export function encrypt(text) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey('encrypt'), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, data].map((b) => b.toString('base64url')).join('.')
}

export function decrypt(blob) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64url'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey('encrypt'), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// "State" is a tamper-proof note we hand to Google and get back after the
// user approves. It proves the request started from our logged-in app.
export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', derivedKey('state')).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState(state) {
  const [body, sig] = String(state || '').split('.')
  if (!body || !sig) throw new HttpError(400, 'Invalid state')
  const expected = crypto.createHmac('sha256', derivedKey('state')).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new HttpError(400, 'Invalid state')
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (!payload.exp || Date.now() > payload.exp) throw new HttpError(400, 'Expired, please try again')
  return payload
}

// The web address of our app (e.g. https://house-inventory.vercel.app),
// used to build the address Google sends the user back to.
export function appOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

// Ask Google's token service for tokens (form-encoded POST).
export async function googleTokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, body }
}

// Wraps a server function so any error becomes a tidy JSON reply.
export function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      const status = err.status || 500
      if (status >= 500) console.error(err)
      res.status(status).json({ error: err.message || 'Server error' })
    }
  }
}
