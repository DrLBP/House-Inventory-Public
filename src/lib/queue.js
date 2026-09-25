// The upload queue: keeps every new photo SAFE ON THE PHONE until it has
// been fully saved to Google Drive and Supabase. If there's no signal, the
// photos simply wait here and upload automatically when back online.
//
// Photos are kept in the phone's built-in browser database (IndexedDB),
// which survives closing the app. (Clearing Chrome's "site data" for this
// app would erase photos still waiting, so the app shows how many are waiting.)
//
// Each photo goes through these steps. Every step is safe to repeat, so if
// the app closes half-way, it just picks up again next time:
//   1. create the draft item (if it's a new item)
//   2. upload the full-size photo to Drive: Home Inventory/[Home]/[Room]/
//   3. upload the tiny preview to the private Supabase "thumbnails" bucket
//   4. save the photo's record (Drive file id, original date, etc.)
//   5. remove it from the queue
import { createStore, get, set, del, values } from 'idb-keyval'
import { supabase } from './supabase'
import { ensureRoomFolder, uploadPhoto } from './google'
import { photoFileName, kindLabel } from './photoNames'
import { scheduleBackup } from './backup'

const store = createStore('home-inventory', 'upload-queue')
const RETRY_EVERY_MS = 30 * 1000

// ---------- Status that screens can display ----------
let status = { waiting: 0, uploading: false, error: '' }
const listeners = new Set()

function setStatus(changes) {
  status = { ...status, ...changes }
  listeners.forEach((fn) => fn(status))
}

export function subscribeToQueue(fn) {
  listeners.add(fn)
  fn(status)
  return () => listeners.delete(fn)
}

async function refreshCount() {
  setStatus({ waiting: (await values(store)).length })
}

// ---------- Adding photos ----------
// job = { id, kind, roomId, itemId, takenAt, full, thumb, width, height }
export async function addToQueue(job) {
  await set(job.id, { ...job, queuedAt: Date.now() }, store)
  await refreshCount()
  processQueue() // start uploading right away (doesn't wait)
}

// ---------- Uploading ----------
let running = false
let retryTimer = null

async function uploadOne(job, userId) {
  // Look up the room and home now (names may have changed since capture).
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, name, home:homes(id, name)')
    .eq('id', job.roomId)
    .maybeSingle()
  if (roomError) throw roomError
  if (!room) {
    // The room was deleted while this photo was waiting; nothing to attach it to.
    console.warn('Room deleted; dropping queued photo', job.id)
    await del(job.id, store)
    return
  }

  // 1. Draft item (does nothing if it already exists).
  let itemName = null
  if (job.itemId) {
    const { error } = await supabase
      .from('items')
      .upsert({ id: job.itemId, room_id: job.roomId }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    // If the item already has a name, use it in the Drive file name.
    const { data: item } = await supabase.from('items').select('name').eq('id', job.itemId).maybeSingle()
    itemName = item?.name || null
  }

  // 2. Full-size photo to Google Drive (skipped if done on an earlier try).
  if (!job.driveFileId) {
    const folder = await ensureRoomFolder(room.home, room)
    const label = kindLabel(job.kind)
    const file = await uploadPhoto({
      blob: job.full,
      name: photoFileName({ kind: job.kind, itemName, takenAt: job.takenAt, mimeType: job.mimeType }),
      mimeType: job.mimeType || 'image/jpeg',
      folderId: folder.id,
      photoId: job.id,
      takenAt: job.takenAt,
      description:
        `${label} photo. Taken ${new Date(job.takenAt).toLocaleString()}. ` +
        `Home: ${room.home.name}. Room: ${room.name}.`,
      tags: { hiKind: job.kind, hiRoomId: job.roomId, ...(job.itemId ? { hiItemId: job.itemId } : {}) },
    })
    job = { ...job, driveFileId: file.id, driveFileName: file.name }
    await set(job.id, job, store) // remember, so a retry won't upload twice
  }

  // 3. Tiny preview to the private Supabase bucket, in our own folder.
  const thumbPath = `${userId}/${job.id}.jpg`
  const { error: thumbError } = await supabase.storage
    .from('thumbnails')
    .upload(thumbPath, job.thumb, { upsert: true, contentType: 'image/jpeg' })
  if (thumbError) throw thumbError

  // 4. The photo's record.
  const { error: photoError } = await supabase.from('photos').upsert({
    id: job.id,
    room_id: job.roomId,
    item_id: job.itemId || null,
    kind: job.kind,
    taken_at: job.takenAt,
    drive_file_id: job.driveFileId,
    drive_file_name: job.driveFileName,
    thumb_path: thumbPath,
    width: job.width,
    height: job.height,
    size_bytes: job.full.size,
    ...(job.mimeType === 'application/pdf' ? { mime_type: job.mimeType } : {}),
  })
  if (photoError) throw photoError

  // 5. Done: remove from the phone's queue, and refresh the spreadsheet backup.
  await del(job.id, store)
  scheduleBackup()
}

export async function processQueue() {
  if (running) return
  running = true
  clearTimeout(retryTimer)
  try {
    const jobs = (await values(store)).sort((a, b) => a.queuedAt - b.queuedAt)
    if (!jobs.length) return setStatus({ waiting: 0, error: '' })
    if (!navigator.onLine) return setStatus({ waiting: jobs.length, error: 'No internet connection' })

    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return setStatus({ waiting: jobs.length, error: 'Not logged in' })

    setStatus({ uploading: true, error: '' })
    for (const job of jobs) {
      const current = await get(job.id, store) // re-read in case it changed
      if (current) await uploadOne(current, userId)
      await refreshCount()
    }
    setStatus({ error: '' })
  } catch (err) {
    console.error('Upload failed; will retry', err)
    setStatus({
      error: err.notConnected ? 'Google Drive is not connected (see Settings)' : err.message || String(err),
    })
  } finally {
    running = false
    setStatus({ uploading: false })
    await refreshCount()
    // Anything left? Try again shortly.
    if (status.waiting > 0) retryTimer = setTimeout(processQueue, RETRY_EVERY_MS)
  }
}

// Called once after login: resume any waiting uploads, and retry
// automatically when the phone gets its connection back.
let started = false
export function startQueue() {
  if (started) return
  started = true
  window.addEventListener('online', processQueue)
  // Ask the phone not to clear our stored photos when space runs low.
  navigator.storage?.persist?.().catch(() => {})
  processQueue()
}
