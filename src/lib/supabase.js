// Connection to our Supabase project (login + database).
//
// The two values below come from "environment variables", which are settings
// kept OUTSIDE the code (in Vercel, or in a .env.local file on a computer).
// The "publishable" key is designed to be visible in the browser. Our data is
// protected by the login plus database security rules, not by hiding this key.
// The SECRET key must NEVER be used here.
import { createClient } from '@supabase/supabase-js'

// trim() drops invisible spaces/line breaks that sneak in when pasting.
const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Keep only the main address (e.g. https://abcd.supabase.co). Some Supabase
// screens show a longer version ending in "/rest/v1/", which breaks login.
const url = (() => {
  try {
    return new URL(rawUrl).origin
  } catch {
    return rawUrl
  }
})()

// Just the web address part of the URL, shown on the login screen for troubleshooting.
export const supabaseHost = (() => {
  try {
    return new URL(url).host
  } catch {
    return `not a valid web address (${url})`
  }
})()

// True if both settings have been filled in.
export const isSupabaseConfigured = Boolean(url && publishableKey)

// The connection itself. It stays logged in on this device and renews the
// login automatically in the background.
export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      // Always ask the database afresh; never reuse an answer the browser saved
      // earlier (a saved error could otherwise keep showing after it's fixed).
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    })
  : null
