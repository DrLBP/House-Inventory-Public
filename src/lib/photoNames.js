// File names for photos in Google Drive, e.g.
//   "Samsung TV - 2026-09-23 14-05-33.jpg"
//   "Samsung TV - receipt - 2026-09-23 14-06-10.jpg"
//   "Room overview - 2026-09-23 14-03-00.jpg"
// A draft item with no name yet is called "Item" until it gets one.

// Local date/time like "2026-09-23 14-05-33" (no ":" so it's a safe file name).
export function fileStamp(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

export function photoFileName({ kind, itemName, takenAt, mimeType }) {
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg'
  // Remove characters that are awkward in file names.
  const name = (itemName || 'Item').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'Item'
  if (kind === 'room_overview') return `Room overview - ${fileStamp(takenAt)}.${ext}`
  if (kind === 'receipt') return `${name} - receipt - ${fileStamp(takenAt)}.${ext}`
  return `${name} - ${fileStamp(takenAt)}.${ext}`
}

export function kindLabel(kind) {
  return kind === 'room_overview' ? 'Room overview' : kind === 'receipt' ? 'Receipt' : 'Item'
}
