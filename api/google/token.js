// Gives the logged-in app a SHORT-LIVED Google pass (about 1 hour), made from
// the stored long-term key. The long-term key itself never leaves the server.
import { handle, HttpError, env, supabaseAdmin, requireUser, decrypt, googleTokenRequest } from '../_lib/server.js'

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
  const admin = supabaseAdmin()
  const user = await requireUser(req, admin)

  const { data: row, error } = await admin
    .from('google_connection')
    .select('google_email, refresh_token_encrypted')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!row) return res.status(404).json({ connected: false })

  // If the stored key can't be unlocked (e.g. APP_SECRET was changed in
  // Vercel), forget it so the app simply asks to reconnect Google.
  let refreshToken
  try {
    refreshToken = decrypt(row.refresh_token_encrypted)
  } catch {
    await admin.from('google_connection').delete().eq('owner_id', user.id)
    return res.status(404).json({ connected: false, reason: 'reconnect' })
  }

  const { ok, body } = await googleTokenRequest({
    refresh_token: refreshToken,
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  })

  if (!ok) {
    // "invalid_grant" = the key was revoked or expired. Forget it so the app
    // shows "Connect Google Drive" again.
    if (body.error === 'invalid_grant') {
      await admin.from('google_connection').delete().eq('owner_id', user.id)
      return res.status(404).json({ connected: false, reason: 'expired' })
    }
    throw new HttpError(502, `Google error: ${body.error || 'unknown'}`)
  }

  res.status(200).json({
    connected: true,
    email: row.google_email,
    access_token: body.access_token,
    expires_in: body.expires_in,
  })
})
