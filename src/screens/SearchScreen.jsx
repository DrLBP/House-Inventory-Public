// Search across ALL items in all homes: name, category, brand, model,
// serial number, notes, and room/home names.
//
// All items are loaded once when the screen opens, and searching happens
// instantly on the phone as you type. Several words must ALL match, in any
// field (e.g. "samsung kitchen").
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/csv'
import { coverPhoto } from '../lib/data'
import { Header, errorText } from '../components'
import { useThumbUrls, Thumb } from '../photos'
import { formatItemValue } from '../format'

// Fields searched, with the label shown when a match is found in them.
const FIELDS = [
  ['name', 'Name'], ['category', 'Category'], ['brand', 'Brand'], ['model', 'Model'],
  ['serial_number', 'Serial'], ['notes', 'Notes'], ['room', 'Room'], ['home', 'Home'],
]

const QUERY_KEY = 'hi.searchQuery' // remember the search when coming back from an item

function readQuery() {
  try { return sessionStorage.getItem(QUERY_KEY) || '' } catch { return '' }
}

export default function SearchScreen() {
  const [items, setItems] = useState(null)
  const [photos, setPhotos] = useState({})
  const [error, setError] = useState('')
  const [query, setQuery] = useState(readQuery)

  useEffect(() => {
    Promise.all([
      fetchAll(() => supabase.from('homes').select('id, name').order('id')),
      fetchAll(() => supabase.from('rooms').select('id, home_id, name').order('id')),
      fetchAll(() => supabase.from('items')
        .select('*')
        .order('created_at').order('id')),
      fetchAll(() => supabase.from('photos').select('id, item_id, kind, thumb_path')
        .eq('kind', 'item').order('taken_at').order('id')),
    ])
      .then(([homes, rooms, rawItems, rawPhotos]) => {
        const homeName = Object.fromEntries(homes.map((h) => [h.id, h.name]))
        const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]))
        setItems(rawItems.map((i) => ({
          ...i,
          room: roomById[i.room_id]?.name || '',
          home: homeName[roomById[i.room_id]?.home_id] || '',
        })))
        const byItem = {}
        for (const p of rawPhotos) (byItem[p.item_id] ||= []).push(p)
        setPhotos(Object.fromEntries(rawItems.map((i) => [i.id, coverPhoto(i, byItem[i.id] || [])])))
      })
      .catch((e) => setError(errorText(e)))
  }, [])

  function handleChange(e) {
    setQuery(e.target.value)
    try { sessionStorage.setItem(QUERY_KEY, e.target.value) } catch { /* ignore */ }
  }

  // The matching items, each with the first field (other than name) that matched.
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!items || !words.length) return []
    const out = []
    for (const item of items) {
      // Unnamed items can be found by searching "draft".
      const values = FIELDS.map(([f]) => String((f === 'name' ? item.name || 'Draft item' : item[f]) ?? '').toLowerCase())
      if (!words.every((w) => values.some((v) => v.includes(w)))) continue
      // Show WHERE it matched when it wasn't in the name (e.g. "Serial: ABC123").
      let matchedIn = null
      for (let k = 1; k < FIELDS.length && !matchedIn; k++) {
        if (words.some((w) => values[k].includes(w)) && !words.every((w) => values[0].includes(w))) {
          matchedIn = `${FIELDS[k][1]}: ${item[FIELDS[k][0]]}`
        }
      }
      out.push({ item, matchedIn })
      if (out.length >= 200) break
    }
    return out
  }, [items, query])

  const urls = useThumbUrls(results.map((r) => photos[r.item.id]).filter(Boolean))

  return (
    <>
      <Header title="Search" />
      <main className="content with-nav">
        <input
          type="search"
          className="search-box"
          placeholder="Search name, brand, model, serial #, notes…"
          value={query}
          onChange={handleChange}
          autoFocus
          enterKeyHint="search"
          aria-label="Search items"
        />
        {error && <p className="error">{error}</p>}
        {!items && !error && <p className="muted">Loading items…</p>}

        {items && query.trim() && (
          <p className="muted">
            {results.length === 0
              ? 'No matching items.'
              : `${results.length}${results.length >= 200 ? '+' : ''} item${results.length === 1 ? '' : 's'} found`}
          </p>
        )}
        {items && !query.trim() && (
          <p className="muted">Search all {items.length} items across every home.</p>
        )}

        <ul className="list">
          {results.map(({ item, matchedIn }) => {
            const photo = photos[item.id]
            const value = formatItemValue(item)
            return (
              <li key={item.id}>
                <a className="row item-row" href={`#/item/${item.id}`}>
                  <Thumb url={photo && urls[photo.thumb_path]} size={56} label={photo ? '' : '—'} />
                  <span className="row-main">
                    <strong>{item.name || 'Draft item'}</strong>
                    <span className="muted">
                      {item.home} › {item.room}
                      {value ? ` · ${value}` : ''}
                    </span>
                    {matchedIn && <span className="match">{matchedIn}</span>}
                  </span>
                  {item.needs_details && <span className="badge">Needs details</span>}
                </a>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
