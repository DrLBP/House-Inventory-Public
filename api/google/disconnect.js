// Disconnect Google: tell Google to cancel our key, then delete it.
// Your files in Google Drive are NOT deleted.
import { handle, HttpError, supabaseAdmin, requireUser, decrypt } from '../_lib/server.js'

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
  const admin = supabaseAdmin()
  const user = await requireUser(req, admin)

  const { data: row } = await admin
    .from('google_connection')
    .select('refresh_token_encrypted')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (row) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: decrypt(row.refresh_token_encrypted) }),
      })
    } catch (err) {
      console.error('Revoke failed (continuing)', err)
    }
    const { error } = await admin.from('google_connection').delete().eq('owner_id', user.id)
    if (error) throw error
  }
  res.status(200).json({ connected: false })
})
