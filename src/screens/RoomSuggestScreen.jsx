// "✨ Suggest for items in this room": pick items, let Claude look at each
// one, then review the suggestions item by item. Nothing is saved until
// Apply is tapped for an item (or "Apply all ticked").
import { useEffect, useState } from 'react'
import { getRoomContents, coverPhoto } from '../lib/data'
import { navigate } from '../lib/router'
import {
  subscribe, currentJob, startJob, stopJob, resumeJob, clearJob, updateRows, skipItem,
  retryItem, applyItem, applyAllTicked, EST_CENTS,
} from '../lib/bulkAi'
import { Header, errorText } from '../components'
import { useThumbUrls, Thumb } from '../photos'
import { SuggestionRows } from '../AiAssist'
import { formatMoney } from '../format'

const hasPhoto = (item) => item.photos.some((p) => p.kind === 'item' || p.kind === 'receipt')
const cover = (item) => coverPhoto(item)
const money = (cents) => formatMoney(cents / 100)

function useJob() {
  const [job, setJob] = useState(currentJob)
  useEffect(() => subscribe(setJob), [])
  return job
}

export default function RoomSuggestScreen({ roomId }) {
  const job = useJob()
  const [data, setData] = useState(null) // { room, items }
  const [error, setError] = useState('')

  useEffect(() => {
    getRoomContents(roomId).then(setData, (e) => setError(errorText(e)))
  }, [roomId])

  const items = data?.items || []
  const jobItems = job?.roomId === roomId ? job.entries.map((e) => e.item) : []
  const urls = useThumbUrls([...items, ...jobItems].map(cover).filter(Boolean))

  let body
  if (error) body = <p className="error">{error}</p>
  else if (job?.roomId === roomId) body = <Review job={job} urls={urls} />
  else if (job) body = <OtherRoom job={job} />
  else if (!data) body = <p>Loading…</p>
  else body = <Choose room={data.room} items={items} urls={urls} />

  return (
    <>
      <Header title="✨ Suggest for items" backTo={`/room/${roomId}`} />
      <main className="content">{body}</main>
    </>
  )
}

// Suggestions are open for a different room: only one room at a time.
function OtherRoom({ job }) {
  return (
    <div className="sync-warning">
      <p>
        {job.running ? 'Claude is still working on' : 'There are suggestions to review for'}{' '}
        <strong>{job.roomName}</strong>. One room at a time.
      </p>
      <div className="button-row">
        <button onClick={() => navigate(`/room/${job.roomId}/suggest`)}>Go to {job.roomName}</button>
        {!job.running && (
          <button className="secondary" onClick={() => {
            if (window.confirm(`Drop the suggestions for ${job.roomName} that weren’t applied?`)) clearJob()
          }}>
            Drop them
          </button>
        )}
      </div>
    </div>
  )
}

// Step 1: choose the items and what to look up.
function Choose({ room, items, urls }) {
  const [chosen, setChosen] = useState(() => new Set(items.filter((i) => i.needs_details).map((i) => i.id)))
  const [suggest, setSuggest] = useState(true)
  const [price, setPrice] = useState(false)
  const [error, setError] = useState('')

  if (!items.length) return <p className="muted">This room has no items yet.</p>

  const picked = items.filter((i) => chosen.has(i.id))
  const estimate = picked.reduce(
    (sum, i) => sum + (suggest && hasPhoto(i) ? EST_CENTS.suggest : 0) + (price ? EST_CENTS.price : 0), 0)
  const toggle = (id) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChosen(next)
  }

  function start() {
    try {
      startJob(room.id, room.name, picked, { suggest, price })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <p className="muted">
        Claude looks at each chosen item. You then review every suggestion; nothing is saved
        until you tap Apply.
      </p>

      <div className="choose-head">
        <strong>{picked.length} of {items.length} items</strong>
        <span>
          <button className="link" onClick={() => setChosen(new Set(items.filter((i) => i.needs_details).map((i) => i.id)))}>
            Needs details
          </button>
          {' · '}
          <button className="link" onClick={() => setChosen(new Set(items.map((i) => i.id)))}>All</button>
          {' · '}
          <button className="link" onClick={() => setChosen(new Set())}>None</button>
        </span>
      </div>
      <ul className="list">
        {items.map((item) => (
          <li key={item.id}>
            <label className="row item-row choose-row">
              <input type="checkbox" checked={chosen.has(item.id)} onChange={() => toggle(item.id)} />
              <Thumb url={cover(item) && urls[cover(item).thumb_path]} size={48} label={cover(item) ? '' : 'No photo'} />
              <span className="row-main">
                <strong>{item.name || 'Draft item'}</strong>
                {!hasPhoto(item) && <span className="muted">No photo: price lookup only</span>}
              </span>
              {item.needs_details && <span className="badge">Needs details</span>}
            </label>
          </li>
        ))}
      </ul>

      <label className="check-line">
        <input type="checkbox" checked={suggest} onChange={(e) => setSuggest(e.target.checked)} />
        Suggest details from photos
      </label>
      <label className="check-line">
        <input type="checkbox" checked={price} onChange={(e) => setPrice(e.target.checked)} />
        Look up current prices (web search)
      </label>

      {error && <p className="error">{error}</p>}
      <p className="muted">
        Estimated cost: about {money(estimate)} (charged to your Anthropic account).
        Takes roughly {Math.max(1, Math.round((picked.length * (price ? 50 : 30)) / 2 / 60))} min.
      </p>
      <button disabled={!picked.length || (!suggest && !price)} onClick={start}>
        Start ({picked.length} item{picked.length === 1 ? '' : 's'})
      </button>
    </>
  )
}

// Step 2: progress, then one card per item to review.
function Review({ job, urls }) {
  const [applyingAll, setApplyingAll] = useState(false)
  const finished = job.entries.filter((e) => !['waiting', 'working'].includes(e.status)).length
  const total = job.entries.length
  const tickedCount = job.entries.filter((e) => e.status === 'ready' && e.rows.some((r) => r.checked)).length
  const unapplied = job.entries.some((e) => e.status === 'ready' && e.rows.length)
  const stopped = job.entries.some((e) => e.status === 'stopped')

  function finish() {
    if (unapplied && !window.confirm('Some suggestions weren’t applied or skipped. Drop them?')) return
    clearJob()
    navigate(`/room/${job.roomId}`)
  }

  return (
    <>
      <div className="bulk-progress">
        <div>
          <strong>
            {job.running
              ? `Checking items… ${finished} of ${total} done`
              : `Checked ${total - job.entries.filter((e) => e.status === 'stopped').length} of ${total} items`}
          </strong>
          <div className="muted">Cost so far: {money(job.costCents)}</div>
        </div>
        {job.running && (
          <button className="secondary" disabled={job.stopping} onClick={stopJob}>
            {job.stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
        {!job.running && stopped && <button className="secondary" onClick={resumeJob}>Continue</button>}
      </div>
      <progress className="bulk-bar" max={total} value={finished} />
      {job.running && <p className="muted">You can keep using the app meanwhile. Closing the app stops it.</p>}

      {job.entries.map((e) => (
        <ItemCard key={e.item.id} entry={e} url={cover(e.item) && urls[cover(e.item).thumb_path]} />
      ))}

      <div className="button-row bulk-actions">
        {tickedCount > 0 && (
          <button disabled={applyingAll} onClick={async () => {
            setApplyingAll(true)
            await applyAllTicked()
            setApplyingAll(false)
          }}>
            {applyingAll ? 'Saving…' : `Apply all ticked (${tickedCount} item${tickedCount === 1 ? '' : 's'})`}
          </button>
        )}
        {!job.running && <button className="secondary" onClick={finish}>Finish</button>}
      </div>
    </>
  )
}

function ItemCard({ entry: e, url }) {
  const { item } = e
  return (
    <div className={`bulk-card ${e.status}`}>
      <div className="bulk-card-head">
        <Thumb url={url} size={56} label={url ? '' : 'No photo'} />
        <div className="row-main">
          <a href={`#/item/${item.id}`}><strong>{item.name || 'Draft item'}</strong></a>
          <span className="muted">{statusText(e)}</span>
        </div>
      </div>

      {e.status === 'error' && (
        <>
          <p className="error">{e.error}</p>
          <div className="button-row">
            <button className="secondary" onClick={() => retryItem(item.id)}>Try again</button>
            <button className="secondary" onClick={() => skipItem(item.id)}>Skip</button>
          </div>
        </>
      )}

      {(e.status === 'ready' || e.status === 'saving') && (
        <div className="ai-results">
          {e.rows.length > 0 && <SuggestionRows rows={e.rows} onChange={(rows) => updateRows(item.id, rows)} />}
          {e.info.map((t) => <p key={t} className="muted ai-note">{t}</p>)}
          {e.error && <p className="error">{e.error}</p>}
          <div className="button-row">
            {e.rows.length > 0 && (
              <button disabled={e.status === 'saving' || !e.rows.some((r) => r.checked)}
                onClick={() => applyItem(item.id)}>
                {e.status === 'saving' ? 'Saving…' : 'Apply'}
              </button>
            )}
            <button className="secondary" disabled={e.status === 'saving'} onClick={() => skipItem(item.id)}>
              {e.rows.length > 0 ? 'Skip' : 'OK'}
            </button>
          </div>
        </div>
      )}

      {e.status === 'applied' && e.error && <p className="muted">{e.error}</p>}
    </div>
  )
}

function statusText(e) {
  switch (e.status) {
    case 'waiting': return 'Waiting…'
    case 'working': return `⏳ ${e.step || 'Working…'}`
    case 'ready': return e.rows.length ? 'Review the suggestions:' : 'Nothing new found.'
    case 'saving': return 'Saving…'
    case 'applied': return '✅ Saved'
    case 'skipped': return 'Skipped (nothing changed)'
    case 'stopped': return 'Not checked (stopped)'
    case 'error': return 'Couldn’t be checked'
    default: return ''
  }
}
