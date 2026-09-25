// Step 1 of connecting Google: the app (logged in) asks for the Google
// approval page address, then sends the user there.
import { handle, HttpError, env, supabaseAdmin, requireUser, signState, appOrigin, GOOGLE_SCOPES } from '../_lib/server.js'

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
  const user = await requireUser(req, supabaseAdmin())

  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: `${appOrigin(req)}/api/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline', // gives us the long-term key (refresh token)
    prompt: 'consent', // always hand back a fresh long-term key
    // Valid for 10 minutes; ties the approval to our logged-in account.
    state: signState({ uid: user.id, exp: Date.now() + 10 * 60 * 1000 }),
  })
  res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
})
