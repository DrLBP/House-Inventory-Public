// Login screen: one shared family email + password.
// There is deliberately no "sign up" button: the only account is created
// by hand in the Supabase dashboard, and new sign-ups are switched off there.
import { useState } from 'react'
import { supabase, supabaseHost } from './lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault() // stop the page from reloading
    setBusy(true)
    setError('')
    try {
      // trim() removes stray spaces a phone keyboard may add to the email.
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      // On success, App.jsx notices the new login and switches screens.
      // On failure, show Supabase's own reason (it never includes secrets),
      // which makes problems much easier to track down.
      if (error) setError(`Login failed: ${error.message}`)
    } catch (err) {
      setError(`Could not reach Supabase: ${err.message}`)
    }
    setBusy(false)
  }

  return (
    <main className="page">
      <img src="/icon.svg" alt="" className="logo" />
      <h1>Home Inventory</h1>
      <form className="card" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      {/* Shows which Supabase project the app is talking to (not a secret).
          Handy for spotting a mistyped setting in Vercel. */}
      <p className="small">Connected to: {supabaseHost}</p>
    </main>
  )
}
