// Daily "keep-alive", run automatically by Vercel once a day (see "crons"
// in vercel.json). It does two small things so the app is ready whenever
// you next use it, even months later:
//   1. A tiny database request, so Supabase's free plan doesn't pause the
//      project for inactivity (it pauses after about 7 quiet days).
//   2. Uses the saved Google key once, because Google cancels keys that go
//      unused for 6 months.
//
// Only Vercel's scheduler may run it: Vercel sends the CRON_SECRET setting
// with each run, and anything without it is refused.
import { handle, HttpError, env, supabaseAdmin, decrypt, googleTokenRequest } from './_lib/server.js'

export default handle(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${env('CRON_SECRET')}`) throw new HttpError(401, 'Not allowed')
  const admin = supabaseAdmin()
  const result = { database: 'ok', google: [] }

  // 1. Database
  const { error } = await admin.from('homes').select('id').limit(1)
  if (error) throw new HttpError(502, `Database check failed: ${error.message}`)

  // 2. Google key(s)
  const { data: rows, error: rowsError } = await admin
    .from('google_connection')
    .select('owner_id, refresh_token_encrypted')
  if (rowsError) throw rowsError
  for (const row of rows) {
    try {
      const { ok, body } = await googleTokenRequest({
        refresh_token: decrypt(row.refresh_token_encrypted),
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        grant_type: 'refresh_token',
      })
      result.google.push(ok ? 'ok' : `problem: ${body.error}`)
    } catch (err) {
      result.google.push(`problem: ${err.message}`)
    }
  }

  console.log('Keep-alive', JSON.stringify(result))
  res.status(200).json(result)
})
