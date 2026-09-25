// Checks whether our Supabase project is reachable. Supabase's free plan
// pauses a project after about a week without use; when that happens the
// app can't load anything until it's restored in the Supabase dashboard.
// (A daily keep-alive, api/keepalive.js, should prevent this; this check is
// the safety net that explains what's wrong if it happens anyway.)
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Link straight to this project in the Supabase dashboard.
export function supabaseDashboardLink() {
  try {
    const ref = new URL(url).host.split('.')[0]
    return `https://supabase.com/dashboard/project/${ref}`
  } catch {
    return 'https://supabase.com/dashboard'
  }
}

// Returns 'ok', 'offline' (the phone has no internet), or 'unreachable'
// (the internet works but Supabase doesn't answer: most likely paused).
export async function checkSupabase() {
  if (!url || !key) return 'ok' // not set up yet; the app shows "Setup needed" instead
  if (!navigator.onLine) return 'offline'
  try {
    const res = await fetch(`${new URL(url).origin}/auth/v1/health`, {
      headers: { apikey: key },
      cache: 'no-store',
    })
    if (res.ok) return 'ok'
    // 540 is Supabase's "project paused" code; other 5xx errors mean it isn't working.
    if (res.status >= 500) return 'unreachable'
    return 'ok' // any other answer means the project is up
  } catch {
    // No answer at all. Is it just our internet? Try Google to tell the difference.
    try {
      await fetch('https://www.googleapis.com/discovery/v1/apis?name=drive&preferred=true', { cache: 'no-store' })
      return 'unreachable'
    } catch {
      return 'offline'
    }
  }
}
