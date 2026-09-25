// Step 2 of connecting Google: after you approve, Google sends the browser
// here with a one-time code. We trade it for the long-term key, encrypt it,
// store it in Supabase, and send you back to the app's Settings screen.
import {
  env, supabaseAdmin, verifyState, encrypt, appOrigin, googleTokenRequest, DRIVE_FILE_SCOPE,
} from '../_lib/server.js'

export default async function handler(req, res) {
  const origin = appOrigin(req)
  const backToApp = (result) => {
    res.writeHead(302, { Location: `${origin}/#/settings?google=${result}` })
    res.end()
  }

  try {
    const { code, state, error } = req.query
    if (error) return backToApp('cancelled') // you pressed Cancel on Google's page
    const { uid } = verifyState(state)

    const { ok, body: tokens } = await googleTokenRequest({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: 'authorization_code',
    })
    if (!ok || !tokens.refresh_token) {
      console.error('Google token exchange failed', tokens.error, tokens.error_description)
      return backToApp('error')
    }
    // Google lets people untick individual permissions. We need Drive access.
    if (!String(tokens.scope || '').split(' ').includes(DRIVE_FILE_SCOPE)) {
      return backToApp('missing_permission')
    }

    // Which Google account was connected (read from Google's signed ID token,
    // which came to us directly from Google over a secure connection).
    let email = null
    if (tokens.id_token) {
      const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString())
      email = payload.email || null
    }

    const { error: dbError } = await supabaseAdmin().from('google_connection').upsert({
      owner_id: uid,
      google_email: email,
      refresh_token_encrypted: encrypt(tokens.refresh_token),
    })
    if (dbError) {
      console.error('Saving Google connection failed', dbError)
      return backToApp('error')
    }
    return backToApp('connected')
  } catch (err) {
    console.error(err)
    return backToApp('error')
  }
}
