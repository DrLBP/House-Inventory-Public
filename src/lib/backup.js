// Automatic spreadsheet backup to Google Drive.
//
// A few seconds after anything changes (photos uploaded, details saved,
// items/rooms/homes added or deleted), the app writes a fresh
//   Home Inventory/inventory-backup.csv
// with EVERYTHING in it. If Supabase or this app ever disappeared, your
// Drive folder alone would still hold all the photos AND all the details.
//
// It also keeps one snapshot per month in "Home Inventory/Backup history/",
// e.g. "inventory-backup 2026-09.csv". So if items were ever deleted by
// mistake, an older copy still exists. (Drive also keeps recent versions of
// the main file: right-click it in Drive → "Manage versions".)
//
// If the phone is offline, the backup is remembered and done later.
import { buildInventoryCsv } from './csv'
import { ensureRootFolder, ensureBackupHistoryFolder, saveTextFile } from './google'

const DRIVE_README = [
  'HOME INVENTORY - READ ME FIRST',
  '',
  'This folder is a complete record of our household belongings, kept for insurance',
  '(fire, flood, theft). It is created and kept up to date automatically by our',
  'personal Home Inventory app, but it is designed to be understood WITHOUT the app.',
  '',
  "WHAT'S HERE",
  '- inventory-backup.csv: every item with its details (name, category, brand,',
  '  model, serial number, purchase date and price, replacement value, notes).',
  '  Open it in Google Sheets or Excel. It is refreshed after every change.',
  '  The "Photo files" and "Receipt files" columns name each item\'s photos.',
  '- One folder per home, with one folder per room inside it, holding the',
  '  full-size photos and receipts. Each photo\'s date (and its description in',
  '  Drive) shows when it was originally taken, which helps prove ownership.',
  '- Backup history: one copy of the spreadsheet per month, in case something',
  '  was deleted by mistake. (Drive also keeps recent versions of',
  '  inventory-backup.csv: right-click it -> "Manage versions".)',
  '',
  'Estimated value = replacement value, or purchase price if no replacement value',
  'was entered.',
  '',
  'PRIVACY: this folder contains our address, serial numbers and values.',
  'Keep it private and do not share it by link.',
  '',
].join('\r\n')

const DELAY_MS = 5000 // wait for a pause in changes, then back up once
const PENDING_KEY = 'hi.backupPending'
const LAST_KEY = 'hi.lastBackup'

let timer = null
let running = false
let status = { lastBackup: readLocal(LAST_KEY), error: '', running: false }
const listeners = new Set()

function readLocal(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLocal(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* ignore */ }
}

function setStatus(changes) {
  status = { ...status, ...changes }
  listeners.forEach((fn) => fn(status))
}

export function subscribeToBackup(fn) {
  listeners.add(fn)
  fn(status)
  return () => listeners.delete(fn)
}

// Call after any change. Many quick changes = a single backup.
export function scheduleBackup() {
  writeLocal(PENDING_KEY, '1')
  clearTimeout(timer)
  timer = setTimeout(runBackup, DELAY_MS)
}

export async function runBackup() {
  clearTimeout(timer)
  if (running) return scheduleBackup() // one is already going; do another after
  if (!navigator.onLine) return setStatus({ error: 'Offline, will back up when back online' })
  running = true
  setStatus({ running: true, error: '' })
  try {
    const { csv } = await buildInventoryCsv()
    const root = await ensureRootFolder()
    await saveTextFile({
      name: 'inventory-backup.csv', folderId: root.id, content: csv,
      tagKey: 'hiRole', tagValue: 'csv-backup',
    })
    // Monthly snapshot (created once per month, then kept up to date that month).
    const month = new Date().toISOString().slice(0, 7) // e.g. "2026-09"
    const history = await ensureBackupHistoryFolder()
    await saveTextFile({
      name: `inventory-backup ${month}.csv`, folderId: history.id, content: csv,
      tagKey: 'hiMonthlyBackup', tagValue: month,
    })
    // A plain-English guide at the top of the Drive folder, so anyone
    // (you, family, an insurance adjuster) can understand it without the app.
    await saveTextFile({
      name: 'READ ME FIRST.txt', folderId: root.id, content: DRIVE_README,
      tagKey: 'hiRole', tagValue: 'readme', mimeType: 'text/plain',
    })
    const now = new Date().toISOString()
    writeLocal(LAST_KEY, now)
    writeLocal(PENDING_KEY, null)
    setStatus({ lastBackup: now, error: '' })
  } catch (err) {
    console.error('Backup failed; will retry', err)
    setStatus({ error: err.notConnected ? 'Google Drive is not connected' : err.message })
    clearTimeout(timer)
    timer = setTimeout(runBackup, 60 * 1000) // try again in a minute
  } finally {
    running = false
    setStatus({ running: false })
  }
}

// Called once after login: finish any backup that didn't happen last time
// (e.g. the phone was offline), and retry when the connection returns.
let started = false
export function startBackups() {
  if (started) return
  started = true
  window.addEventListener('online', () => {
    if (readLocal(PENDING_KEY)) runBackup()
  })
  if (readLocal(PENDING_KEY) || !status.lastBackup) scheduleBackup()
}
