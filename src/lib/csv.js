// Builds a spreadsheet (CSV file) of the WHOLE inventory: every home, room,
// item and photo. Used for the automatic backup in Google Drive, and later
// for the "download spreadsheet" button.
//
// One row per item, plus one row per room for its room-overview photos.
// Photo file names are listed so each photo in Drive can be matched to its
// item, even without the app. Drive folder = Home Inventory/[Home]/[Room]/
import { supabase } from './supabase'
import { itemTotal } from '../format'

// Supabase returns at most 1000 rows per request, so fetch page by page.
export async function fetchAll(makeQuery) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

const COLUMNS = [
  'Home', 'Home address', 'Room', 'Type', 'Item name', 'Category', 'Brand', 'Model',
  'Serial number', 'Purchase date', 'Quantity', 'Purchase price each (USD)', 'Replacement value each (USD)',
  'Total value (USD)',
  'Notes', 'Needs details', 'Photo taken (first)', 'Photo count', 'Photo files',
  'Receipt files', 'Drive folder', 'Item ID', 'Last updated', 'Home photo file', 'Product link',
]

// Put one value into CSV form: wrap in quotes when needed, and stop
// spreadsheet programs from treating text like "=..." as a formula.
function cell(value) {
  if (value == null) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function localDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('en-US') : ''
}

export async function buildInventoryCsv() {
  const [homes, rooms, items, photos] = await Promise.all([
    fetchAll(() => supabase.from('homes').select('id, name, address, sort_order, photo_drive_file_name').order('sort_order').order('id')),
    fetchAll(() => supabase.from('rooms').select('id, home_id, name, sort_order').order('sort_order').order('id')),
    fetchAll(() => supabase.from('items').select('*').order('created_at').order('id')),
    fetchAll(() => supabase.from('photos')
      .select('id, room_id, item_id, kind, taken_at, drive_file_name').order('taken_at').order('id')),
  ])

  const homeById = Object.fromEntries(homes.map((h) => [h.id, h]))
  const photosByItem = {}
  const overviewsByRoom = {}
  for (const p of photos) {
    if (p.item_id) (photosByItem[p.item_id] ||= []).push(p)
    else (overviewsByRoom[p.room_id] ||= []).push(p)
  }
  const itemsByRoom = {}
  for (const i of items) (itemsByRoom[i.room_id] ||= []).push(i)

  const lines = [COLUMNS.map(cell).join(',')]
  let itemCount = 0
  // Rooms in the same order as in the app: by home, then room order.
  const orderedRooms = homes.flatMap((h) => rooms.filter((r) => r.home_id === h.id))

  for (const room of orderedRooms) {
    const home = homeById[room.home_id]
    const folder = `Home Inventory/${home.name}/${room.name}/`
    const base = [home.name, home.address, room.name]

    const overviews = overviewsByRoom[room.id] || []
    if (overviews.length) {
      lines.push([
        ...base, 'Room overview', '', '', '', '', '', '', '', '', '', '', '', '',
        localDateTime(overviews[0].taken_at), overviews.length,
        overviews.map((p) => p.drive_file_name).join(' | '), '', folder, '', '', home.photo_drive_file_name,
      ].map(cell).join(','))
    }

    for (const item of itemsByRoom[room.id] || []) {
      itemCount += 1
      const all = photosByItem[item.id] || []
      const itemPhotos = all.filter((p) => p.kind === 'item')
      const receipts = all.filter((p) => p.kind === 'receipt')
      lines.push([
        ...base, 'Item', item.name || 'Draft item', item.category, item.brand, item.model,
        item.serial_number, item.purchase_date, item.quantity || 1, item.purchase_price, item.replacement_value,
        itemTotal(item) || '',
        item.notes, item.needs_details ? 'Yes' : 'No',
        localDateTime(itemPhotos[0]?.taken_at || all[0]?.taken_at), all.length,
        itemPhotos.map((p) => p.drive_file_name).join(' | '),
        receipts.map((p) => p.drive_file_name).join(' | '),
        folder, item.id, localDateTime(item.updated_at), home.photo_drive_file_name, item.product_url,
      ].map(cell).join(','))
    }
  }

  // "﻿" at the start helps Excel read special characters correctly.
  return { csv: '﻿' + lines.join('\r\n') + '\r\n', itemCount }
}
