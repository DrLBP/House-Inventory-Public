// All the ways the app reads and changes homes, rooms, items and photos.
// Security is enforced by the database itself (row-level security), so
// these only ever see our own data.
import { supabase } from './supabase'
import { trashDriveFile, renameDriveFile, ensureHomeFolder, ensureRoomFolder, uploadPhoto, updateDriveFile } from './google'
import { processGalleryFile } from './images'
import { fileStamp, photoFileName } from './photoNames'
import { scheduleBackup } from './backup'
import { cleanProductUrl } from '../format'

// Supabase returns { data, error }. This turns an error into a thrown
// exception so the screens can catch it and show a message.
function check({ data, error }) {
  if (error) throw error
  return data
}

// Use after a successful change: queues an automatic spreadsheet backup to
// Google Drive (see backup.js) and passes the result through.
function changed(result) {
  scheduleBackup()
  return result
}

// ---------- Homes ----------
export async function listHomes() {
  return check(await supabase.from('homes').select('*').order('sort_order').order('created_at'))
}

export async function getHome(id) {
  return check(await supabase.from('homes').select('*').eq('id', id).single())
}

export async function createHome({ name, address }, sortOrder) {
  return changed(check(
    await supabase
      .from('homes')
      .insert({ name: name.trim(), address: address.trim() || null, sort_order: sortOrder })
      .select()
      .single(),
  ))
}

export async function updateHome(id, { name, address }) {
  return changed(check(
    await supabase
      .from('homes')
      .update({ name: name.trim(), address: address.trim() || null })
      .eq('id', id),
  ))
}

export async function deleteHome(id) {
  const rooms = check(await supabase.from('rooms').select('id').eq('home_id', id))
  await removeThumbnails(rooms.map((r) => r.id))
  const home = check(await supabase.from('homes').select('photo_thumb_path').eq('id', id).single())
  if (home.photo_thumb_path) await supabase.storage.from('thumbnails').remove([home.photo_thumb_path])
  return changed(check(await supabase.from('homes').delete().eq('id', id)))
}

// ---------- Rooms ----------
export async function listRooms(homeId) {
  return check(
    await supabase
      .from('rooms')
      .select('*')
      .eq('home_id', homeId)
      .order('sort_order')
      .order('created_at'),
  )
}

export async function createRoom(homeId, name, sortOrder) {
  return changed(check(
    await supabase
      .from('rooms')
      .insert({ home_id: homeId, name: name.trim(), sort_order: sortOrder })
      .select()
      .single(),
  ))
}

export async function renameRoom(id, name) {
  return changed(check(await supabase.from('rooms').update({ name: name.trim() }).eq('id', id)))
}

export async function deleteRoom(id) {
  await removeThumbnails([id])
  return changed(check(await supabase.from('rooms').delete().eq('id', id)))
}

// Before deleting rooms, remove their tiny previews from storage (the
// database removes the item and photo records by itself). Full-size photos
// in Google Drive are deliberately KEPT, as a safety net.
async function removeThumbnails(roomIds) {
  if (!roomIds.length) return
  const photos = check(
    await supabase.from('photos').select('thumb_path').in('room_id', roomIds).not('thumb_path', 'is', null),
  )
  const paths = photos.map((p) => p.thumb_path)
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from('thumbnails').remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

// A room together with its home (used by the capture screen's title).
export async function getRoomWithHome(roomId) {
  return check(
    await supabase.from('rooms').select('*, home:homes(id, name)').eq('id', roomId).single(),
  )
}

// ---------- Items ----------
// How many items each room has, e.g. { roomId: 12, ... }.
export async function countItemsByRoom(roomIds) {
  if (!roomIds.length) return {}
  const rows = check(await supabase.from('items').select('room_id').in('room_id', roomIds))
  const counts = {}
  for (const row of rows) counts[row.room_id] = (counts[row.room_id] || 0) + 1
  return counts
}

// Save a new order: each row gets sort_order = its position in the list.
// Works for either table ('homes' or 'rooms').
export async function saveOrder(table, orderedRows) {
  await Promise.all(
    orderedRows.map((row, index) =>
      supabase.from(table).update({ sort_order: index }).eq('id', row.id).then(check),
    ),
  )
}

// ---------- Items & photos (Step 6) ----------
// These use the Drive helpers, so the Drive copy stays in step when
// something is renamed or deleted in the app.

export const CATEGORIES = [
  'Appliances', 'Art', 'Books & Media', 'Clothing', 'Collectibles', 'Decor',
  'Electronics', 'Furniture', 'Home Fixtures', 'Jewelry', 'Kitchenware', 'Musical Instruments',
  'Sports & Outdoors', 'Tools', 'Toys & Games', 'Other',
]

const DETAIL_FIELDS = [
  'name', 'category', 'brand', 'model', 'serial_number', 'quantity', 'product_url',
  'purchase_date', 'purchase_price', 'replacement_value', 'notes',
]

// An item is "complete enough" once it has a name and a value.
export function itemNeedsDetails(item) {
  const hasValue = item.replacement_value != null || item.purchase_price != null
  return !(item.name && hasValue)
}

// True if nothing at all has been typed in for this item (quantity doesn't
// count, since every item has one).
function itemIsBlank(item) {
  return DETAIL_FIELDS.filter((f) => f !== 'quantity').every((f) => item[f] == null || item[f] === '')
}

const PHOTO_FIELDS = 'id, kind, item_id, room_id, taken_at, drive_file_id, drive_file_name, thumb_path, mime_type'
// "An item with its photos", naming the exact database link to use (photo →
// its item), so the database can never find the request ambiguous.
const ITEM_PHOTOS = `photos!photos_item_id_fkey(${PHOTO_FIELDS})`

// The photo shown for an item in lists: the one chosen as its main photo,
// or else its oldest item photo (or any photo, e.g. a receipt, if that's all).
// `photos` = that item's photos, oldest first.
export function coverPhoto(item, photos = item.photos || []) {
  const itemPhotos = photos.filter((p) => p.kind === 'item')
  return itemPhotos.find((p) => p.id === item.cover_photo_id) || itemPhotos[0] || photos[0] || null
}

// The item's photos with the main photo first (the rest oldest first).
export function mainPhotoFirst(item, photos) {
  const main = coverPhoto(item, photos)
  return main ? [main, ...photos.filter((p) => p !== main)] : photos
}

export async function setCoverPhoto(itemId, photoId) {
  check(await supabase.from('items').update({ cover_photo_id: photoId }).eq('id', itemId))
}

// Mark a room as walked through and checked today.
export async function markRoomReviewed(roomId) {
  check(await supabase.from('rooms').update({ reviewed_at: new Date().toISOString() }).eq('id', roomId))
}

// Photos sorted oldest first.
function byTakenAt(a, b) {
  return a.taken_at.localeCompare(b.taken_at)
}

// Everything the room screen shows: the room, its items (each with photos),
// and the room overview photos.
export async function getRoomContents(roomId) {
  const [room, items, overviews] = await Promise.all([
    getRoomWithHome(roomId),
    supabase.from('items').select(`*, ${ITEM_PHOTOS}`).eq('room_id', roomId)
      .order('created_at').then(check),
    supabase.from('photos').select(PHOTO_FIELDS).eq('room_id', roomId).eq('kind', 'room_overview')
      .order('taken_at').then(check),
  ])
  items.forEach((i) => i.photos.sort(byTakenAt))
  return { room, items, overviews }
}

// One item with its photos and its room/home.
export async function getItem(itemId) {
  const item = check(
    await supabase
      .from('items')
      .select(`*, ${ITEM_PHOTOS}, room:rooms(id, name, home:homes(id, name))`)
      .eq('id', itemId)
      .maybeSingle(),
  )
  item?.photos.sort(byTakenAt)
  return item
}

// Save an item's details. If the name changed, rename its photos in Drive
// too, so Drive stays readable without the app ("Samsung TV - ....jpg").
// Returns a warning message if the Drive renaming didn't fully work.
export async function updateItem(item, values) {
  const clean = {}
  for (const f of DETAIL_FIELDS) {
    const v = values[f]
    clean[f] = typeof v === 'string' ? v.trim() || null : v ?? null
  }
  clean.quantity = Math.max(1, Math.round(Number(values.quantity) || 1))
  clean.product_url = cleanProductUrl(values.product_url)
  clean.needs_details = itemNeedsDetails(clean)
  changed(check(await supabase.from('items').update(clean).eq('id', item.id)))

  if ((clean.name || null) === (item.name || null)) return null
  try {
    for (const photo of item.photos) {
      const name = photoFileName({ kind: photo.kind, itemName: clean.name, takenAt: photo.taken_at, mimeType: photo.mime_type })
      if (name === photo.drive_file_name) continue
      await renameDriveFile(photo.drive_file_id, name)
      check(await supabase.from('photos').update({ drive_file_name: name }).eq('id', photo.id))
    }
    return null
  } catch (err) {
    return `Details saved, but the photo names in Google Drive weren't updated (${err.message}).`
  }
}

// Delete one photo: Drive copy to Drive's Trash, then the preview and record.
export async function deletePhoto(photo) {
  await trashDriveFile(photo.drive_file_id)
  await forgetPhotos([photo])
  scheduleBackup()
}

// Delete an item and all its photos (Drive copies go to Drive's Trash).
export async function deleteItem(item) {
  for (const photo of item.photos) await trashDriveFile(photo.drive_file_id)
  await forgetPhotos(item.photos)
  changed(check(await supabase.from('items').delete().eq('id', item.id)))
}

// Remove photos from the app only (previews + records). Drive is not touched.
async function forgetPhotos(photos) {
  const paths = photos.map((p) => p.thumb_path).filter(Boolean)
  if (paths.length) {
    const { error } = await supabase.storage.from('thumbnails').remove(paths)
    if (error) throw error
  }
  if (photos.length) {
    check(await supabase.from('photos').delete().in('id', photos.map((p) => p.id)))
  }
}

// Photos that were deleted directly in Google Drive: remove them from the
// app too. Items left with no photos AND no details are removed as well;
// items with details keep them.
export async function removePhotosMissingFromDrive(missing, items) {
  await forgetPhotos(missing)
  const missingIds = new Set(missing.map((p) => p.id))
  for (const item of items) {
    // Only items that actually lost a photo (a blank item someone just
    // created on purpose, with no photos yet, is left alone).
    if (!item.photos.some((p) => missingIds.has(p.id))) continue
    const remaining = item.photos.filter((p) => !missingIds.has(p.id))
    if (remaining.length === 0 && itemIsBlank(item)) {
      check(await supabase.from('items').delete().eq('id', item.id))
    }
  }
  scheduleBackup()
}

// ---------- Home photo ----------
// Save (or replace) the outside photo of a home. Needs a connection: the
// full-size photo goes to Drive (Home Inventory/[Home]/), the preview to the
// private thumbnails bucket. A replaced photo goes to Drive's Trash.
export async function setHomePhoto(home, file) {
  const photo = await processGalleryFile(file) // keeps the original photo date
  const folder = await ensureHomeFolder(home)
  const photoId = crypto.randomUUID()
  const uploaded = await uploadPhoto({
    blob: photo.full,
    name: `Home photo - ${fileStamp(photo.takenAt)}.jpg`,
    folderId: folder.id,
    photoId,
    takenAt: photo.takenAt,
    description: `Photo of ${home.name}. Taken ${new Date(photo.takenAt).toLocaleString()}.`,
    tags: { hiKind: 'home_photo', hiHomeIdPhoto: home.id },
  })
  const { data: session } = await supabase.auth.getSession()
  const thumbPath = `${session.session.user.id}/home-${photoId}.jpg`
  const { error } = await supabase.storage
    .from('thumbnails')
    .upload(thumbPath, photo.thumb, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error

  await clearHomePhoto(home) // tidy away the previous one, if any
  check(await supabase.from('homes').update({
    photo_drive_file_id: uploaded.id,
    photo_drive_file_name: uploaded.name,
    photo_thumb_path: thumbPath,
    photo_taken_at: photo.takenAt,
  }).eq('id', home.id))
  scheduleBackup()
}

export async function removeHomePhoto(home) {
  await clearHomePhoto(home)
  check(await supabase.from('homes').update({
    photo_drive_file_id: null, photo_drive_file_name: null, photo_thumb_path: null, photo_taken_at: null,
  }).eq('id', home.id))
  scheduleBackup()
}

async function clearHomePhoto(home) {
  if (home.photo_drive_file_id) await trashDriveFile(home.photo_drive_file_id)
  if (home.photo_thumb_path) await supabase.storage.from('thumbnails').remove([home.photo_thumb_path])
}

// A new, blank item in a room (for adding an item without a photo, or as a
// place to move a photo to). Returns the new item.
export async function createBlankItem(roomId) {
  return changed(check(await supabase.from('items').insert({ room_id: roomId }).select().single()))
}

// ---------- Moving a photo ----------
// All rooms and items of a home (for the "move to another item" list).
export async function listHomeItems(homeId) {
  const rooms = await listRooms(homeId)
  const items = rooms.length
    ? check(await supabase.from('items').select('id, name, room_id, created_at')
      .in('room_id', rooms.map((r) => r.id)).order('created_at'))
    : []
  return { rooms, items }
}

// Change a photo's type (item photo / receipt / room overview) and/or which
// item or room it belongs to. The Drive copy is renamed to match and moved
// to the right room folder, so Drive stays in step with the app.
export async function movePhoto(photo, { kind, itemId, roomId }) {
  const room = check(await supabase.from('rooms').select('id, name, home:homes(id, name)').eq('id', roomId).single())
  const item = itemId ? check(await supabase.from('items').select('name').eq('id', itemId).single()) : null
  const name = photoFileName({ kind, itemName: item?.name, takenAt: photo.taken_at, mimeType: photo.mime_type })
  const folder = await ensureRoomFolder(room.home, room)
  await updateDriveFile(photo.drive_file_id, {
    name,
    parentId: folder.id,
    appProperties: { hiKind: kind, hiRoomId: roomId, hiItemId: itemId || null },
  })
  check(await supabase.from('photos')
    .update({ kind, item_id: itemId || null, room_id: roomId, drive_file_name: name })
    .eq('id', photo.id))
  scheduleBackup()
}
