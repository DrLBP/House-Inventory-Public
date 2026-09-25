// Full backup download: ONE zip file with every photo and all the details,
// saved to this phone's Downloads (never uploaded anywhere).
//
// Inside the zip:
//   README.txt                      what's in here, in plain English
//   inventory.csv                   the same spreadsheet as the Drive backup
//   inventory-data.json             every detail in computer-readable form
//                                   (so the data could be loaded into a new app)
//   Home Inventory/[Home]/[Room]/   the full-size photos and receipts, named
//                                   and dated exactly like in Google Drive
//
// Photos are fetched from Drive ONE AT A TIME and streamed into the zip, so
// the phone never has to hold all of them in memory at once.
import { downloadZip } from 'client-zip'
import { supabase } from './supabase'
import { fetchAll, buildInventoryCsv } from './csv'
import { downloadDriveFile } from './google'
import { photoFileName } from './photoNames'

// Characters that aren't allowed in file/folder names.
function cleanName(name) {
  return String(name || 'Unnamed').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Unnamed'
}

// Everything needed, plus a rough size for the "about X MB" message.
export async function loadBackupData() {
  const [homes, rooms, items, photos] = await Promise.all([
    fetchAll(() => supabase.from('homes').select('*').order('sort_order').order('id')),
    fetchAll(() => supabase.from('rooms').select('*').order('sort_order').order('id')),
    fetchAll(() => supabase.from('items').select('*').order('created_at').order('id')),
    fetchAll(() => supabase.from('photos').select('*').order('taken_at').order('id')),
  ])
  const totalBytes = photos.reduce((s, p) => s + (p.size_bytes || 500_000), 0)
  return { homes, rooms, items, photos, totalBytes }
}

export async function buildBackupZip({ homes, rooms, items, photos }, onStatus) {
  const createdAt = new Date()
  const homeById = Object.fromEntries(homes.map((h) => [h.id, h]))
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]))
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]))
  const missing = [] // photos that couldn't be found in Drive
  const { csv } = await buildInventoryCsv()

  // Work out each photo's path in the zip, avoiding duplicate names.
  const used = new Set()
  const entries = photos
    .filter((p) => roomById[p.room_id] && homeById[roomById[p.room_id].home_id])
    .map((p) => {
      const room = roomById[p.room_id]
      const home = homeById[room.home_id]
      const folder = `Home Inventory/${cleanName(home.name)}/${cleanName(room.name)}/`
      const ext = p.mime_type === 'application/pdf' ? 'pdf' : 'jpg'
      const base = cleanName(
        p.drive_file_name ||
          photoFileName({ kind: p.kind, itemName: itemById[p.item_id]?.name, takenAt: p.taken_at, mimeType: p.mime_type }),
      ).replace(/\.(jpe?g|pdf)$/i, '')
      let path = `${folder}${base}.${ext}`
      for (let n = 2; used.has(path.toLowerCase()); n++) path = `${folder}${base} (${n}).${ext}`
      used.add(path.toLowerCase())
      return { photo: p, path }
    })

  // Each home's outside photo goes in the home's folder.
  for (const home of homes) {
    if (!home.photo_drive_file_id) continue
    const path = `Home Inventory/${cleanName(home.name)}/${cleanName(home.photo_drive_file_name || 'Home photo').replace(/\.jpe?g$/i, '')}.jpg`
    used.add(path.toLowerCase())
    entries.push({ photo: { drive_file_id: home.photo_drive_file_id, taken_at: home.photo_taken_at || createdAt.toISOString(), id: `home-${home.id}` }, path })
  }

  // The files, produced one by one as the zip is written.
  async function* files() {
    yield { name: 'inventory.csv', input: csv, lastModified: createdAt }
    yield {
      name: 'inventory-data.json',
      input: JSON.stringify({ exportedAt: createdAt.toISOString(), homes, rooms, items, photos,
        photoPaths: Object.fromEntries(entries.map((e) => [e.photo.id, e.path])) }, null, 2),
      lastModified: createdAt,
    }
    let n = 0
    for (const { photo, path } of entries) {
      n += 1
      onStatus(`Adding photos… ${n} of ${entries.length}`)
      let blob = null
      try {
        blob = await downloadDriveFile(photo.drive_file_id)
      } catch (err) {
        if (err.notConnected) throw err
        console.warn('Photo download failed', err)
      }
      if (!blob) {
        missing.push(path)
        continue
      }
      yield { name: path, input: blob, lastModified: new Date(photo.taken_at) }
    }
    // Written last, so it can list any photos that were missing.
    yield { name: 'README.txt', input: readme(createdAt, homes, items, entries.length - missing.length, missing), lastModified: createdAt }
  }

  onStatus('Starting…')
  // Chrome keeps large downloads on the phone's storage rather than in memory.
  const blob = await downloadZip(files()).blob()
  const stamp = createdAt.toISOString().slice(0, 10)
  return { blob, fileName: `Home Inventory - full backup - ${stamp}.zip`, missingCount: missing.length }
}

function readme(createdAt, homes, items, photoCount, missing) {
  return [
    'HOME INVENTORY - FULL BACKUP',
    `Created: ${createdAt.toLocaleString('en-US')}`,
    `Homes: ${homes.map((h) => h.name).join(', ')}`,
    `Items: ${items.length}    Photos: ${photoCount}`,
    '',
    "WHAT'S IN THIS FILE",
    '- inventory.csv: every item with its details (open in Excel, Google Sheets or Numbers).',
    '  The "Photo files" and "Receipt files" columns give each item\'s photo file names.',
    '- Home Inventory/[Home]/[Room]/: the full-size photos and receipts, in the same folders',
    '  as in Google Drive. Each file\'s date is the date the photo was originally taken.',
    '- inventory-data.json: all the same information in a computer-readable format, which',
    '  could be used to load everything into a new app.',
    '',
    'Estimated value = replacement value, or purchase price if no replacement value was entered.',
    '',
    'KEEP THIS FILE SAFE: it contains your address, serial numbers and the value of your',
    'belongings. Store it somewhere private (for example an encrypted USB drive or a',
    'personal cloud folder), not somewhere public.',
    ...(missing.length
      ? ['', `NOTE: ${missing.length} photo(s) could not be found in Google Drive and are not included:`,
        ...missing.map((m) => `  - ${m}`)]
      : []),
    '',
  ].join('\r\n')
}
