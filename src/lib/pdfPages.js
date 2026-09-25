// Turning PDF pages into pictures (for previews, the viewer, the insurance
// report, and so on). Uses Mozilla's pdf.js, loaded only when a PDF is
// actually involved, so the app stays quick to open.
export const PDF = 'application/pdf'

// The "legacy" build is used because it also works on older phone browsers.
let pdfjsPromise = null
async function pdfjs() {
  pdfjsPromise ||= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })
  return pdfjsPromise
}

// Render up to `maxPages` pages, each fitting within `maxSide` pixels.
// Returns [{ blob (JPEG), width, height }] and the total page count.
export async function renderPdfPages(pdfBlob, { maxPages = 1, maxSide = 1600, quality = 0.85 } = {}) {
  const lib = await pdfjs()
  const task = lib.getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()), isEvalSupported: false })
  const doc = await task.promise
  const pages = []
  try {
    for (let n = 1; n <= Math.min(maxPages, doc.numPages); n++) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff' // PDFs can be transparent; receipts should be on white
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, canvas, viewport }).promise
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      pages.push({ blob, width: canvas.width, height: canvas.height })
      page.cleanup()
    }
    return { pages, pageCount: doc.numPages }
  } finally {
    task.destroy()
  }
}
