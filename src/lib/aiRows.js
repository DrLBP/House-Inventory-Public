// Shared by the item screen's "✨ AI assist" panel and the room's
// "Suggest for items" screen: asks Claude, then turns the answer into
// "current → suggested" rows for the owner to tick.
import { suggestDetails, lookUpPrice } from './ai'
import { formatMoney, linkLabel, cleanProductUrl } from '../format'

// Suggestion fields -> item fields, with labels.
export const FIELDS = [
  ['name', 'Name'], ['category', 'Category'], ['brand', 'Brand'], ['model', 'Model'],
  ['serial_number', 'Serial number'], ['quantity', 'Quantity'],
  ['replacement_value', 'Replacement value (each)'], ['purchase_date', 'Purchase date'],
  ['purchase_price', 'Purchase price (each)'], ['product_url', 'Product link'],
]
const MONEY = new Set(['replacement_value', 'purchase_price'])

// How a value is displayed in a row.
export function show(field, value) {
  if (value == null || value === '') return 'none'
  if (MONEY.has(field)) return formatMoney(value)
  if (field === 'product_url') return `${linkLabel(value)} ↗`
  return String(value)
}

const isEmpty = (v) => v == null || String(v).trim() === ''

// One row per suggested value that differs from what's there now.
// Rows filling an empty field start ticked; rows replacing something don't.
export function buildRows(suggested, current) {
  const list = []
  for (const [field, label] of FIELDS) {
    const value = suggested[field]
    if (isEmpty(value)) continue
    const now = current[field]
    if (String(now ?? '').trim() === String(value).trim()) continue // already the same
    const empty = isEmpty(now) || (field === 'quantity' && String(now) === '1')
    list.push({ field, label, current: now, suggested: value, checked: empty })
  }
  return list
}

// The ticked rows as { field: value } changes.
export function changesFrom(rows) {
  const changes = {}
  for (const r of rows) {
    if (!r.checked) continue
    changes[r.field] = r.field === 'product_url' ? cleanProductUrl(r.suggested) : String(r.suggested)
  }
  return changes
}

// Ask Claude. `current` = the item's details now; `photos` = its photos.
// what: { suggest: true/false, price: true/false }.
// Returns { rows, info: [text], costCents }.
export async function getSuggestions(current, photos, what, onStatus) {
  let s = {}
  const info = []
  let costCents = 0
  const usable = photos.filter((p) => p.kind === 'item' || p.kind === 'receipt')

  if (what.suggest) {
    if (!usable.length) throw new Error('Add a photo of the item (or its label) first.')
    const now = Object.fromEntries(FIELDS.map(([f]) => [f, current[f] || null]))
    const res = await suggestDetails(usable, now, onStatus)
    s = res.suggestions
    costCents += res.costCents || 0
    info.push(
      s.value_basis && { basis: `Value: ${s.value_basis}` },
      s.store && `Receipt store: ${s.store}`,
      s.notes && `Check: ${s.notes}`,
    )
  }

  if (what.price) {
    // Search using what's already filled in, or else what Claude just suggested.
    const pick = (f) => (isEmpty(current[f]) ? s[f] : current[f]) || null
    const search = { name: pick('name'), brand: pick('brand'), model: pick('model'), category: pick('category') }
    if (!search.name && !search.brand && !search.model) {
      if (!what.suggest) throw new Error('Add a name (or brand/model) first, so there is something to search for.')
      info.push('Price not looked up: the item couldn’t be identified.')
    } else {
      const { result: r, costCents: c } = await lookUpPrice(search, onStatus)
      costCents += c || 0
      if (r.price != null) {
        s = { ...s, replacement_value: r.price }
        // The web price replaces Claude's estimate, so drop the estimate's explanation.
        info.splice(0, info.length, ...info.filter((t) => !t?.basis))
        if (what.suggest) info.push(`Replacement value is the current web price${r.store ? ` (${r.store})` : ''}.`)
      }
      if (r.product_url) s = { ...s, product_url: r.product_url }
      info.push(
        r.match === 'equivalent' && 'The price is for a comparable current product, not the exact same model.',
        !what.suggest && r.store && `Found at: ${r.store}`,
        r.note,
        r.price == null && !r.product_url && 'No current price found.',
      )
    }
  }

  const text = info.filter(Boolean).map((t) => t.basis || t)
  return { rows: buildRows(s, current), info: text, costCents }
}
