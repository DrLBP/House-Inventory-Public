// Dashboard: total estimated value, broken down by room and by category,
// plus the list of items that still need details.
//
// An item's value = its replacement value, or its purchase price if there's
// no replacement value yet (items with neither count as $0 and show up in
// "Needs details").
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/csv'
import { coverPhoto } from '../lib/data'
import { Header, errorText } from '../components'
import { useThumbUrls, Thumb } from '../photos'
import { formatMoney, itemTotal } from '../format'

const itemValue = itemTotal // value each × quantity

async function loadEverything() {
  const [homes, rooms, items, photos] = await Promise.all([
    fetchAll(() => supabase.from('homes').select('id, name, sort_order').order('sort_order').order('id')),
    fetchAll(() => supabase.from('rooms').select('id, home_id, name, sort_order').order('sort_order').order('id')),
    fetchAll(() => supabase.from('items')
      .select('*')
      .order('created_at').order('id')),
    // Only item photos are needed here (for the "needs details" previews).
    fetchAll(() => supabase.from('photos').select('id, item_id, kind, thumb_path, taken_at')
      .eq('kind', 'item').order('taken_at').order('id')),
  ])
  return { homes, rooms, items, photos }
}

export default function DashboardScreen() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [homeId, setHomeId] = useState('all') // filter: 'all' or one home
  const [showAllNeeds, setShowAllNeeds] = useState(false)

  useEffect(() => {
    loadEverything().then(setData).catch((e) => setError(errorText(e)))
  }, [])

  // Work out everything for the chosen home(s).
  let view = null
  if (data) {
    const homeById = Object.fromEntries(data.homes.map((h) => [h.id, h]))
    const rooms = data.rooms.filter((r) => homeId === 'all' || r.home_id === homeId)
    const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]))
    const items = data.items.filter((i) => roomById[i.room_id])
    const multipleHomes = homeId === 'all' && data.homes.length > 1

    const byRoom = rooms
      .map((r) => {
        const inRoom = items.filter((i) => i.room_id === r.id)
        return {
          key: r.id,
          label: multipleHomes ? `${homeById[r.home_id]?.name} › ${r.name}` : r.name,
          href: `#/room/${r.id}`,
          value: inRoom.reduce((s, i) => s + itemValue(i), 0),
          count: inRoom.length,
        }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.value - a.value)

    const categoryTotals = {}
    for (const i of items) {
      const c = i.category || 'Uncategorized'
      categoryTotals[c] ||= { key: c, label: c, value: 0, count: 0 }
      categoryTotals[c].value += itemValue(i)
      categoryTotals[c].count += 1
    }
    const byCategory = Object.values(categoryTotals).sort((a, b) => b.value - a.value)

    const photosOf = {}
    for (const p of data.photos) (photosOf[p.item_id] ||= []).push(p)
    const needs = items
      .filter((i) => i.needs_details)
      .map((i) => ({
        ...i,
        photo: coverPhoto(i, photosOf[i.id] || []),
        where: `${multipleHomes ? homeById[roomById[i.room_id].home_id]?.name + ' › ' : ''}${roomById[i.room_id].name}`,
      }))

    view = {
      total: items.reduce((s, i) => s + itemValue(i), 0),
      itemCount: items.length,
      byRoom,
      byCategory,
      needs,
    }
  }

  const shownNeeds = view ? (showAllNeeds ? view.needs : view.needs.slice(0, 10)) : []
  const urls = useThumbUrls(shownNeeds.map((i) => i.photo).filter(Boolean))

  return (
    <>
      <Header title="Dashboard" />
      <main className="content with-nav">
        {error && <p className="error">{error}</p>}
        {!data && !error && <p>Loading…</p>}

        {data && data.homes.length > 1 && (
          <div className="chips filter-row" role="group" aria-label="Choose home">
            {[{ id: 'all', name: 'All homes' }, ...data.homes].map((h) => (
              <button key={h.id} className={`chip ${homeId === h.id ? 'on' : ''}`}
                onClick={() => setHomeId(h.id)}>
                {h.name}
              </button>
            ))}
          </div>
        )}

        {view && (
          <>
            {/* Headline numbers */}
            <section className="hero">
              <div className="hero-label">Total estimated value</div>
              <div className="hero-value">{formatMoney(view.total)}</div>
            </section>
            <div className="kpis">
              <div className="kpi">
                <div className="kpi-value">{view.itemCount}</div>
                <div className="kpi-label">items</div>
              </div>
              {/* Scrolls down to the list. (Not a "#needs" link: the part after
                  "#" is what the app uses to choose the screen.) */}
              <button type="button" className="kpi" onClick={() =>
                document.getElementById('needs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <div className="kpi-value">{view.needs.length}</div>
                <div className="kpi-label">need details ›</div>
              </button>
            </div>

            <h3>Value by room</h3>
            <BarList rows={view.byRoom} empty="No items yet." />

            <h3>Value by category</h3>
            <BarList rows={view.byCategory} empty="No items yet." />

            <h3 id="needs">Needs details ({view.needs.length})</h3>
            {view.needs.length === 0 ? (
              <p className="muted">🎉 Every item has a name and a value.</p>
            ) : (
              <>
                <p className="muted">Items still missing a name or a value. Tap one to fill it in.</p>
                <ul className="list">
                  {shownNeeds.map((i) => (
                    <li key={i.id}>
                      <a className="row item-row" href={`#/item/${i.id}`}>
                        <Thumb url={i.photo && urls[i.photo.thumb_path]} size={48} label={i.photo ? '' : '—'} />
                        <span className="row-main">
                          <strong>{i.name || 'Draft item'}</strong>
                          <span className="muted">{i.where}</span>
                        </span>
                        <span aria-hidden="true">›</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {!showAllNeeds && view.needs.length > 10 && (
                  <button className="secondary" onClick={() => setShowAllNeeds(true)}>
                    Show all {view.needs.length}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}

// A simple horizontal bar list: label and value in text, bar length shows
// the value compared with the biggest one. The numbers are always written
// out, so nothing depends on reading the bar alone.
function BarList({ rows, empty }) {
  if (!rows.length) return <p className="muted">{empty}</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="barlist">
      {rows.map((r) => {
        const content = (
          <>
            <div className="bar-text">
              <span className="bar-label">{r.label}</span>
              <span className="bar-value">{formatMoney(r.value)}</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
            <div className="bar-sub">{r.count} item{r.count === 1 ? '' : 's'}</div>
          </>
        )
        const title = `${r.label}: ${formatMoney(r.value)} across ${r.count} item${r.count === 1 ? '' : 's'}`
        return (
          <li key={r.key} title={title}>
            {r.href ? <a className="bar-row" href={r.href}>{content}</a> : <div className="bar-row">{content}</div>}
          </li>
        )
      })}
    </ul>
  )
}
