// "✨ AI assist" panel on the item screen. Shows Claude's suggestions next to
// what's already filled in; the owner ticks what's right and taps Apply.
// Applying only fills the form: nothing is saved until "Save details".
import { useState } from 'react'
import { getSuggestions, changesFrom, show } from './lib/aiRows'

// The "current → suggested" rows with tick boxes (also used on the room's
// "Suggest for items" screen).
export function SuggestionRows({ rows, onChange }) {
  return rows.map((r, i) => (
    <label key={r.field} className="ai-row">
      <input type="checkbox" checked={r.checked}
        onChange={() => onChange(rows.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))} />
      <span className="ai-field">{r.label}</span>
      <span className="ai-values">
        <span className="ai-current">{show(r.field, r.current)}</span>
        {' → '}
        <strong>{show(r.field, r.suggested)}</strong>
      </span>
    </label>
  ))
}

export default function AiAssist({ photos, form, onApply }) {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [rows, setRows] = useState(null) // [{ field, label, current, suggested, checked }]
  const [info, setInfo] = useState([]) // extra notes to show

  async function run(kind) {
    setError('')
    setRows(null)
    setInfo([])
    try {
      const what = kind === 'suggest' ? { suggest: true } : { price: true }
      const result = await getSuggestions(form, photos, what, setStatus)
      setRows(result.rows)
      setInfo(result.info)
    } catch (e) {
      setError(e.message)
    }
    setStatus('')
  }

  function apply() {
    onApply(changesFrom(rows))
    setRows(null)
    setInfo([])
  }

  const busy = Boolean(status)
  return (
    <div className="ai-panel">
      <div className="ai-head">
        <strong>✨ AI assist</strong>
      </div>
      <div className="button-row">
        <button type="button" className="secondary" disabled={busy} onClick={() => run('suggest')}>
          Suggest details from photos
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => run('price')}>
          Look up current price
        </button>
      </div>
      {status && <p className="muted">⏳ {status}</p>}
      {error && <p className="error">{error}</p>}

      {rows && (
        <div className="ai-results">
          {rows.length === 0
            ? <p className="muted">No new suggestions: everything found matches what’s already filled in.</p>
            : <SuggestionRows rows={rows} onChange={setRows} />}
          {info.map((t) => <p key={t} className="muted ai-note">{t}</p>)}
          <div className="button-row">
            {rows.length > 0 && (
              <button type="button" onClick={apply} disabled={!rows.some((r) => r.checked)}>
                Apply ticked
              </button>
            )}
            <button type="button" className="secondary" onClick={() => { setRows(null); setInfo([]) }}>
              {rows.length > 0 ? 'Dismiss' : 'OK'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
