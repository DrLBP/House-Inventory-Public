// One-time import of an inventory prepared from another app's report
// (e.g. an Encircle PDF). The import file is JSON:
//   { format: 'home-inventory-import', version: 1, source, home: { name, address },
//     rooms: [{ name, overviews: [photo] }],
//     items: [{ id, room, name, category, quantity, replacement_value,
//               purchase_price, purchase_date, notes, photos: [photo] }] }
//   photo = { id, taken_at, image: 'data:image/jpeg;base64,...' }
//
// Everything goes through the app's normal, safe path: rooms and items are
// saved to the database, and photos go into the upload queue (kept on the
// phone until they're in Google Drive + Supabase).
//
// Safe to run twice: items and photos keep the same ids, so a second run
// adds nothing new; rooms are matched by name.
import { supabase } from './supabase'
import { listRooms, createRoom, itemNeedsDetails } from './data'
import { addToQueue } from './queue'
import { scheduleBackup } from './backup'

export async function readImportFile(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('This file isn’t an import file the app understands.')
  }
  if (data?.format !== 'home-inventory-import' || data.version !== 1) {
    throw new Error('This file isn’t an import file the app understands.')
  }
  const photoCount =
    data.rooms.reduce((s, r) => s + r.overviews.length, 0) +
    data.items.reduce((s, i) => s + i.photos.length, 0)
  return { data, summary: { rooms: data.rooms.length, items: data.items.length, photos: photoCount } }
}

// Turn an embedded image into the full photo + tiny preview the queue expects.
// The imported photos are already small, so the "full" one is kept as it is.
async function prepareImage(dataUrl) {
  // Decode the embedded "data:image/jpeg;base64,..." text into a photo file.
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  const full = new Blob([bytes], { type: 'image/jpeg' })
  const bitmap = await createImageBitmap(full)
  const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const { width, height } = bitmap
  bitmap.close()
  const thumb = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.6))
  return { full, thumb, width, height }
}

export async function runImport(data, home, onStatus) {
  // Fill in the home's address if it doesn't have one yet.
  if (!home.address && data.home?.address) {
    const { error } = await supabase.from('homes').update({ address: data.home.address }).eq('id', home.id)
    if (error) throw error
  }

  // Rooms: reuse a room with the same name, otherwise create it.
  onStatus('Creating rooms…')
  const existing = await listRooms(home.id)
  const roomIdByName = {}
  let order = existing.length
  for (const r of data.rooms) {
    const match = existing.find((e) => e.name.trim().toLowerCase() === r.name.trim().toLowerCase())
    roomIdByName[r.name] = match ? match.id : (await createRoom(home.id, r.name, order++)).id
  }

  // Items: insert all at once (existing ids are left untouched).
  onStatus('Saving item details…')
  const rows = data.items.map((i) => {
    const row = {
      id: i.id,
      room_id: roomIdByName[i.room],
      name: i.name || null,
      category: i.category || null,
      quantity: i.quantity || 1,
      replacement_value: i.replacement_value ?? null,
      purchase_price: i.purchase_price ?? null,
      purchase_date: i.purchase_date || null,
      notes: i.notes || null,
    }
    return { ...row, needs_details: itemNeedsDetails(row) }
  })
  const { error } = await supabase.from('items').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error

  // Photos: prepare each one and put it in the upload queue.
  const jobs = [
    ...data.rooms.flatMap((r) => r.overviews.map((p) => ({ p, kind: 'room_overview', room: r.name, itemId: null }))),
    ...data.items.flatMap((i) => i.photos.map((p) => ({ p, kind: 'item', room: i.room, itemId: i.id }))),
  ]
  let n = 0
  for (const { p, kind, room, itemId } of jobs) {
    n += 1
    onStatus(`Preparing photos… ${n} of ${jobs.length}`)
    const img = await prepareImage(p.image)
    await addToQueue({
      id: p.id, kind, roomId: roomIdByName[room], itemId, takenAt: p.taken_at, ...img,
    })
  }
  scheduleBackup()
  return { rooms: data.rooms.length, items: rows.length, photos: jobs.length }
}
