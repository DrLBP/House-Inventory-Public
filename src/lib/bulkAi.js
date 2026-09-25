// "Suggest for items in this room": asks Claude about several items, two at
// a time, and keeps the answers for the owner to review. Nothing is saved
// until the owner taps Apply on an item.
//
// The job lives here (not in a screen) so it keeps going if the owner opens
// another screen in the app. It is kept in memory only: closing the app
// ends it, and unapproved suggestions are simply dropped.
import { getSuggestions, changesFrom } from './aiRows'
import { getItem, updateItem } from './data'

// Rough cost per item, for the estimate shown before starting (US cents).
// The real cost of each request is added up as it goes.
export const EST_CENTS = { suggest: 10, price: 15 }
const AT_ONCE = 2

let job = null
const listeners = new Set()

// Screens get a fresh copy each time, so they know to redraw.
function emit() {
  for (const fn of listeners) fn(job && { ...job })
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function currentJob() {
  return job && { ...job }
}

// entries: one per item. status: waiting | working | ready | error |
// applied | skipped | stopped
function setEntry(itemId, patch) {
  if (!job) return
  job.entries = job.entries.map((e) => (e.item.id === itemId ? { ...e, ...patch } : e))
  emit()
}

// items: the chosen items (each with its photos). what: { suggest, price }.
export function startJob(roomId, roomName, items, what) {
  if (job?.running) throw new Error('Suggestions are already being prepared.')
  const mine = job = {
    roomId, roomName, what, running: true, stopping: false, costCents: 0,
    entries: items.map((item) => ({ item, status: 'waiting', rows: [], info: [], error: '', step: '' })),
  }
  runWorkers(mine)
}

function runWorkers(mine) {
  mine.running = true
  mine.stopping = false
  emit()
  keepScreenOn()
  const workers = Array.from({ length: AT_ONCE }, () => work(mine))
  Promise.all(workers).then(() => {
    mine.running = false
    mine.entries = mine.entries.map((e) => (e.status === 'waiting' ? { ...e, status: 'stopped' } : e))
    releaseScreen()
    emit()
  })
}

async function work(mine) {
  for (;;) {
    if (job !== mine || mine.stopping) return
    const next = mine.entries.find((e) => e.status === 'waiting')
    if (!next) return
    const { item } = next
    setEntry(item.id, { status: 'working', step: 'Starting…' })
    // Only ask for details when there's a photo; otherwise just the price.
    const hasPhoto = item.photos.some((p) => p.kind === 'item' || p.kind === 'receipt')
    const what = { suggest: mine.what.suggest && hasPhoto, price: mine.what.price }
    try {
      if (!what.suggest && !what.price) throw new Error('No photo of this item yet.')
      const result = await getSuggestions(item, item.photos, what, (step) => setEntry(item.id, { step }))
      if (job !== mine) return
      mine.costCents += result.costCents
      setEntry(item.id, { status: 'ready', rows: result.rows, info: result.info, step: '' })
    } catch (e) {
      if (job !== mine) return
      setEntry(item.id, { status: 'error', error: e.message, step: '' })
    }
  }
}

// Finish the items being worked on now, then stop.
export function stopJob() {
  if (!job?.running) return
  job.stopping = true
  emit()
}

// Carry on with the items that weren't reached after Stop.
export function resumeJob() {
  if (!job || job.running) return
  job.entries = job.entries.map((e) => (e.status === 'stopped' ? { ...e, status: 'waiting' } : e))
  runWorkers(job)
}

// Forget the job (unapproved suggestions are dropped).
export function clearJob() {
  if (job?.running) return
  job = null
  emit()
}

export function updateRows(itemId, rows) {
  setEntry(itemId, { rows })
}

// Ask again about one item (e.g. after an error).
export function retryItem(itemId) {
  setEntry(itemId, { status: 'waiting', error: '' })
  if (job && !job.running) runWorkers(job)
}

export function skipItem(itemId) {
  setEntry(itemId, { status: 'skipped' })
}

// Save the ticked suggestions for one item. The item is re-read first, so
// anything changed on the item screen meanwhile is kept.
export async function applyItem(itemId) {
  const entry = job?.entries.find((e) => e.item.id === itemId)
  if (!entry || entry.status !== 'ready') return
  const changes = changesFrom(entry.rows)
  if (!Object.keys(changes).length) return skipItem(itemId)
  setEntry(itemId, { status: 'saving' })
  try {
    const fresh = await getItem(itemId)
    if (!fresh) throw new Error('This item no longer exists.')
    const warning = await updateItem(fresh, { ...fresh, ...changes })
    setEntry(itemId, { status: 'applied', error: warning || '' })
  } catch (e) {
    setEntry(itemId, { status: 'ready', error: `Not saved: ${e.message}` })
  }
}

// Apply every reviewed item that has at least one ticked row.
export async function applyAllTicked() {
  const ids = (job?.entries || [])
    .filter((e) => e.status === 'ready' && e.rows.some((r) => r.checked))
    .map((e) => e.item.id)
  for (const id of ids) await applyItem(id)
}

// Ask the phone not to dim and lock the screen while working (where supported).
let wakeLock = null
async function keepScreenOn() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  } catch {
    wakeLock = null // not allowed or not supported: fine, just slower if the screen locks
  }
}
function releaseScreen() {
  wakeLock?.release().catch(() => {})
  wakeLock = null
}
