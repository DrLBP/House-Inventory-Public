// Tiny preview images live in a PRIVATE Supabase bucket. To show one, we ask
// Supabase for a temporary signed link (valid 1 hour). No public links exist.
import { supabase } from './supabase'

const cache = new Map() // path -> { url, expiresAt }
const LIFETIME_S = 3600

// Returns { [path]: url } for the given thumbnail paths.
export async function getThumbUrls(paths) {
  const now = Date.now()
  const needed = [...new Set(paths.filter(Boolean))].filter((p) => {
    const hit = cache.get(p)
    return !hit || hit.expiresAt < now + 60_000
  })
  if (needed.length) {
    const { data, error } = await supabase.storage.from('thumbnails').createSignedUrls(needed, LIFETIME_S)
    if (error) throw error
    for (const row of data) {
      if (row.signedUrl) cache.set(row.path, { url: row.signedUrl, expiresAt: now + LIFETIME_S * 1000 })
    }
  }
  const result = {}
  for (const p of paths) if (cache.get(p)) result[p] = cache.get(p).url
  return result
}
