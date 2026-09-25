// Talking to Google Drive from the app.
//
// The app never holds the long-term Google key. It asks our Vercel server
// (/api/google/token) for a short-lived pass (~1 hour) and uses that to
// talk to Drive directly. Drive permission is "drive.file": the app can
// only see files and folders it created itself.
import { supabase } from './supabase'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
export const ROOT_FOLDER_NAME = 'Home Inventory'

let cached = null // { token, expiresAt, email } kept in memory only

// Call one of our server functions, proving who we are with the login token.
async function callServer(path) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token}` },
  })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

// Returns { connected: true, email } or { connected: false }.
export async function getGoogleStatus() {
  try {
    await getAccessToken()
    return { connected: true, email: cached.email }
  } catch (err) {
    if (err.notConnected) return { connected: false }
    throw err
  }
}

// A valid short-lived Google pass, fetching a new one when needed.
export async function getAccessToken() {
  if (cached && Date.now() < cached.expiresAt) return cached.token
  const { res, body } = await callServer('/api/google/token')
  if (res.status === 404) {
    cached = null
    const err = new Error('Google Drive is not connected')
    err.notConnected = true
    throw err
  }
  if (!res.ok) throw new Error(body.error || `Server error ${res.status}`)
  cached = {
    token: body.access_token,
    email: body.email,
    // Renew a minute early so a pass never expires mid-upload.
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
  }
  return cached.token
}

// Start connecting: go to Google's approval page. Google sends us back to
// the Settings screen afterwards.
export async function connectGoogle() {
  const { res, body } = await callServer('/api/google/auth-url')
  if (!res.ok) throw new Error(body.error || `Server error ${res.status}`)
  window.location.href = body.url
}

export async function disconnectGoogle() {
  const { res, body } = await callServer('/api/google/disconnect')
  cached = null
  if (!res.ok) throw new Error(body.error || `Server error ${res.status}`)
}

// Make a request to the Drive API with our pass attached.
async function drive(path, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(`${DRIVE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error?.message || `Google Drive error ${res.status}`)
  return body
}

// ---------- Folders ----------
// Our folders are tagged with hidden labels ("appProperties") so the app can
// find them again even if they're renamed or moved in Drive. Files are
// private by default, and this app never creates sharing links.
//
//   Home Inventory/            tag hiRole=root
//     [Home name]/             tag hiHomeId=<home id>
//       [Room name]/           tag hiRoomId=<room id>

const folderCache = new Map() // remembers folder ids while the app is open

// Find one of our files/folders by its hidden label; null if none.
async function findByTag(key, value, extra = '') {
  const q = [
    'trashed = false',
    `appProperties has { key = '${key}' and value = '${value}' }`,
    extra,
  ].filter(Boolean).join(' and ')
  const found = await drive(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&spaces=drive`,
  )
  return found.files?.[0] || null
}

// Find a tagged folder (creating it if missing) and keep its name in step
// with the app, e.g. after a room is renamed.
async function ensureFolder({ tagKey, tagValue, name, parentId }) {
  const cacheKey = `${tagKey}:${tagValue}`
  const cached = folderCache.get(cacheKey)
  if (cached && cached.name === name) return cached

  let folder = await findByTag(tagKey, tagValue, `mimeType = '${FOLDER_TYPE}'`)
  if (!folder) {
    folder = await drive('/files?fields=id,name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_TYPE,
        appProperties: { [tagKey]: tagValue },
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    })
  } else if (folder.name !== name) {
    folder = await drive(`/files/${folder.id}?fields=id,name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }
  folderCache.set(cacheKey, folder)
  return folder
}

// The top "Home Inventory" folder.
export function ensureRootFolder() {
  return ensureFolder({ tagKey: 'hiRole', tagValue: 'root', name: ROOT_FOLDER_NAME })
}

// Home Inventory / Backup history  (monthly spreadsheet snapshots)
export async function ensureBackupHistoryFolder() {
  const root = await ensureRootFolder()
  return ensureFolder({ tagKey: 'hiRole', tagValue: 'backup-history', name: 'Backup history', parentId: root.id })
}

// Create or overwrite a small text file (our CSV backups), found by its tag.
// Saved as a plain .csv file (not converted to a Google Sheet), so any
// spreadsheet program can open it.
export async function saveTextFile({ name, folderId, content, tagKey, tagValue, mimeType = 'text/csv' }) {
  const token = await getAccessToken()
  const blob = new Blob([content], { type: mimeType })
  const existing = await findByTag(tagKey, tagValue)
  let res
  if (existing) {
    // Replace the contents of the existing file (Drive keeps older versions).
    res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id,name`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType }, body: blob },
    )
  } else {
    const body = new FormData()
    body.append('metadata', new Blob([JSON.stringify({
      name, parents: [folderId], mimeType, appProperties: { [tagKey]: tagValue },
    })], { type: 'application/json' }))
    body.append('file', blob)
    res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
    )
  }
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(result.error?.message || `Google Drive error ${res.status}`)
  return result
}

// Home Inventory / [Home name]
export async function ensureHomeFolder(home) {
  const root = await ensureRootFolder()
  return ensureFolder({ tagKey: 'hiHomeId', tagValue: home.id, name: home.name, parentId: root.id })
}

// Home Inventory / [Home name] / [Room name]
export async function ensureRoomFolder(home, room) {
  const homeFolder = await ensureHomeFolder(home)
  return ensureFolder({
    tagKey: 'hiRoomId', tagValue: room.id, name: room.name, parentId: homeFolder.id,
  })
}

// ---------- Photo upload ----------

// Upload a photo into a folder. If this exact photo was already uploaded
// (e.g. the app closed mid-way last time), reuse it instead of duplicating.
// `tags` become hidden labels on the file; `description` is visible in Drive.
export async function uploadPhoto({ blob, name, folderId, photoId, takenAt, description, tags, mimeType = 'image/jpeg' }) {
  const existing = await findByTag('hiPhotoId', photoId)
  if (existing) return existing

  const metadata = {
    name,
    parents: [folderId],
    mimeType,
    description,
    // Shows the original photo date as the file's date in Drive.
    modifiedTime: takenAt,
    appProperties: { hiPhotoId: photoId, ...tags },
  }
  // "Multipart" upload = the file's details and its contents in one request.
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  body.append('file', blob)

  const token = await getAccessToken()
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
  )
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(result.error?.message || `Google Drive upload error ${res.status}`)
  return result
}

export function driveFolderLink(folderId) {
  return `https://drive.google.com/drive/folders/${folderId}`
}

// ---------- Viewing, renaming, deleting photos ----------

// Download a full-size photo from Drive (only when it's actually opened).
// Returns null if the file no longer exists in Drive.
export async function downloadDriveFile(fileId) {
  const token = await getAccessToken()
  const res = await fetch(`${DRIVE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Google Drive error ${res.status}`)
  return res.blob()
}

export async function renameDriveFile(fileId, name) {
  return drive(`/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

// Move a file to Drive's Trash (recoverable there for 30 days).
// A file that's already gone counts as done.
export async function trashDriveFile(fileId) {
  try {
    await drive(`/files/${fileId}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  } catch (err) {
    if (!/not found|404/i.test(err.message)) throw err
  }
}

// The ids of all photos (not folders) this app put in Drive for a room and
// that are still there (not deleted, not in Trash).
export async function listRoomPhotoIdsInDrive(roomId) {
  const q = [
    'trashed = false',
    `mimeType != '${FOLDER_TYPE}'`,
    `appProperties has { key = 'hiRoomId' and value = '${roomId}' }`,
  ].join(' and ')
  const ids = new Set()
  let pageToken = ''
  do {
    const page = await drive(
      `/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id)&pageSize=1000&spaces=drive` +
        (pageToken ? `&pageToken=${pageToken}` : ''),
    )
    page.files?.forEach((f) => ids.add(f.id))
    pageToken = page.nextPageToken || ''
  } while (pageToken)
  return ids
}

// Rename a file, move it to another folder, and/or update its hidden labels
// (used when a photo is moved to another item, room, or type in the app).
// A file that's no longer in Drive is skipped.
export async function updateDriveFile(fileId, { name, parentId, appProperties }) {
  let query = '?fields=id,name'
  if (parentId) {
    const { parents = [] } = await drive(`/files/${fileId}?fields=parents`).catch((err) => {
      if (/not found|404/i.test(err.message)) return { missing: true }
      throw err
    })
    if (!parents.length) return null
    if (!parents.includes(parentId)) {
      query += `&addParents=${parentId}&removeParents=${parents.join(',')}`
    }
  }
  try {
    return await drive(`/files/${fileId}${query}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, appProperties }),
    })
  } catch (err) {
    if (/not found|404/i.test(err.message)) return null
    throw err
  }
}
