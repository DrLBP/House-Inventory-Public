// A clear warning when the database (Supabase) can't be reached, most likely
// because the free plan paused it. Checks when the app opens, when it comes
// back to the screen, and when the phone reconnects to the internet.
import { useEffect, useState } from 'react'
import { checkSupabase, supabaseDashboardLink } from './lib/health'

export default function ConnectionWarning() {
  const [state, setState] = useState('ok')

  useEffect(() => {
    let alive = true
    const run = () => checkSupabase().then((s) => alive && setState(s))
    run()
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', run)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', run)
    }
  }, [])

  if (state !== 'unreachable') return null
  return (
    <div className="paused-warning" role="alert">
      <strong>Your database can’t be reached. It is most likely paused.</strong>
      <p>
        Supabase’s free plan pauses a project after a week without use. To fix it: open
        Supabase, choose this project, and click <strong>Restore project</strong>. It takes a
        few minutes. Nothing is lost, and your photos and backup spreadsheet are safe in
        Google Drive meanwhile.
      </p>
      <div className="button-row">
        <a className="button-link" href={supabaseDashboardLink()} target="_blank" rel="noreferrer">
          Open Supabase
        </a>
        <button className="secondary" onClick={() => checkSupabase().then(setState)}>Check again</button>
      </div>
    </div>
  )
}
