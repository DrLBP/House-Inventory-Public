// Settings: connect / disconnect Google Drive, and log out.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getGoogleStatus, connectGoogle, disconnectGoogle, ensureRootFolder, driveFolderLink,
} from '../lib/google'
import { Header, errorText } from '../components'
import { subscribeToBackup, runBackup } from '../lib/backup'
import { formatDateTime } from '../photos'

// Messages for the result Google sends us back with (see api/google/callback.js).
const RESULT_MESSAGES = {
  connected: '✅ Google Drive connected.',
  cancelled: 'Connecting was cancelled.',
  missing_permission:
    'Google Drive permission was not granted. Please connect again and make sure the Google Drive box is ticked.',
  error: 'Something went wrong connecting Google Drive. Please try again.',
}

export default function SettingsScreen({ result, email }) {
  const [status, setStatus] = useState(null) // null = checking
  const [folder, setFolder] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [backup, setBackup] = useState({})
  useEffect(() => subscribeToBackup(setBackup), [])

  async function refresh() {
    setError('')
    try {
      const s = await getGoogleStatus()
      setStatus(s)
      // When connected, make sure our "Home Inventory" folder exists.
      if (s.connected) setFolder(await ensureRootFolder())
    } catch (e) {
      setError(errorText(e))
    }
  }
  useEffect(() => {
    refresh()
    // Tidy the address so the one-time message doesn't reappear on reload.
    if (result) window.history.replaceState(null, '', '#/settings')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setBusy(true)
    try {
      await connectGoogle() // leaves the app for Google's page
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm(
      'Disconnect Google Drive? Your photos already in Drive stay there. ' +
      'New photos will not be backed up until you connect again.',
    )) return
    setBusy(true)
    try {
      await disconnectGoogle()
      setFolder(null)
      await refresh()
    } catch (e) {
      setError(errorText(e))
    }
    setBusy(false)
  }

  return (
    <>
      <Header title="Settings" backTo="/" showSettings={false} />
      <main className="content">
        {result && RESULT_MESSAGES[result] && <p className="notice">{RESULT_MESSAGES[result]}</p>}
        {error && <p className="error">{error}</p>}

        <h3>Google Drive (photo storage &amp; backup)</h3>
        {status === null && !error && <p>Checking…</p>}

        {status?.connected && (
          <div className="summary column">
            <div>Connected{status.email ? ` as ${status.email}` : ''}.</div>
            {folder ? (
              <a href={driveFolderLink(folder.id)} target="_blank" rel="noreferrer">
                Open the “{folder.name}” folder in Drive
              </a>
            ) : (
              <span className="muted">Preparing the Home Inventory folder…</span>
            )}
            <p className="muted">
              The app can only see files it created, not the rest of your Drive.
            </p>
            <button className="link danger" disabled={busy} onClick={handleDisconnect}>
              Disconnect Google Drive
            </button>
          </div>
        )}

        {status && !status.connected && (
          <>
            <p className="muted">
              Connect your Google account once. Full-size photos, receipts and a
              backup spreadsheet will be saved to a private “Home Inventory” folder
              in your Drive.
            </p>
            <button disabled={busy} onClick={handleConnect}>
              {busy ? 'Opening Google…' : 'Connect Google Drive'}
            </button>
          </>
        )}

        {status?.connected && (
          <>
            <h3>Spreadsheet backup</h3>
            <div className="summary column">
              <div>
                A spreadsheet of all items (<em>inventory-backup.csv</em>) is saved in the
                Home Inventory folder automatically after every change, plus a monthly copy
                in “Backup history”.
              </div>
              <div className="muted">
                {backup.running
                  ? 'Backing up now…'
                  : backup.lastBackup
                    ? `Last backup from this phone: ${formatDateTime(backup.lastBackup)}`
                    : 'Not backed up from this phone yet.'}
              </div>
              {backup.error && <div className="error">Backup problem: {backup.error}</div>}
              <button className="secondary" disabled={backup.running} onClick={runBackup}>
                Back up now
              </button>
            </div>
          </>
        )}

        {status?.connected && (
          <>
            <h3>Import</h3>
            <p className="muted">Bring in an inventory prepared from another app’s report.</p>
            <a className="button-link secondary-link" href="#/import">Import from file</a>
          </>
        )}

        <h3>Account</h3>
        <p className="muted">Logged in as {email}</p>
        <ChangePassword />
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Log out</button>

        {/* Which version of the app is running (handy for troubleshooting). */}
        <p className="muted small-print">App version: {__APP_VERSION__}</p>
      </main>
    </>
  )
}

// Change the family login password (at least 12 characters).
function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (pw.length < 12) return setMsg('Please use at least 12 characters.')
    if (pw !== pw2) return setMsg('The two passwords don’t match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg(`Not changed: ${error.message}`)
    setPw('')
    setPw2('')
    setMsg('✅ Password changed. Update it in your password manager too.')
  }

  if (!open) return <button className="link" onClick={() => setOpen(true)}>Change password</button>
  return (
    <form className="card wide" onSubmit={handleSubmit}>
      <label>
        New password
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </label>
      <label>
        Type it again
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      </label>
      {msg && <p className={msg.startsWith('✅') ? 'notice' : 'error'}>{msg}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      <button type="button" className="secondary" onClick={() => { setOpen(false); setMsg('') }}>Close</button>
    </form>
  )
}
