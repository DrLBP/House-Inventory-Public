// Formatting helpers.
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// 1234.5 -> "$1,234.50"
export function formatMoney(value) {
  return money.format(Number(value || 0))
}

// An item's value EACH: its replacement value, or its purchase price if no
// replacement value was entered (null if neither).
export function itemUnitValue(item) {
  const v = item.replacement_value ?? item.purchase_price
  return v == null ? null : Number(v)
}

// An item's TOTAL value = value each × quantity (quantity defaults to 1).
export function itemTotal(item) {
  return (itemUnitValue(item) ?? 0) * (item.quantity || 1)
}

// e.g. "$392.00" or "4 × $98.00 = $392.00"
export function formatItemValue(item) {
  const each = itemUnitValue(item)
  if (each == null) return null
  const q = item.quantity || 1
  return q > 1 ? `${q} × ${formatMoney(each)} = ${formatMoney(each * q)}` : formatMoney(each)
}

// ---------- Product links ----------
// Bits shops add to links only for tracking; they're not needed to find the product.
const TRACKING = /^(utm_.*|_emr|_eml|refid|ref|ref_|source|treatment|csnid|wfcs|gclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|sca_esv|ved|ei|oq|gs_lp|sclient|uact|bih|biw|dpr|ictx|psc|tag|linkCode|pd_rd_.*|pf_rd_.*|content-id|sr|qid|sprefix|crid|spm|irclickid|irgwc|cm_.*|cid|campaign.*)$/i

// Tidy a pasted link: add https:// if missing, and remove tracking bits.
// Returns null for an empty or unusable link.
export function cleanProductUrl(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key)
    return url.toString()
  } catch {
    return raw // keep whatever was typed rather than losing it
  }
}

// Short label for a link, e.g. "wayfair.com".
export function linkLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}
