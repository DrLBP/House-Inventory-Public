// "✨ Suggest details": Claude looks at an item's photos (and receipts) and
// suggests name, category, brand, model, serial number, value, and purchase
// details. The app shows the suggestions for the owner to approve; nothing
// is saved automatically.
import { handle, HttpError, supabaseAdmin, requireUser } from '../_lib/server.js'
import { MODEL, claudeClient, createMessage, costCents, friendlyError, jsonBody } from '../_lib/claude.js'

const MAX_IMAGES = 5

const SYSTEM = `You help a homeowner document their belongings for an insurance inventory. You will see photos of one household item, sometimes with receipt photos, plus any details the owner has already entered. Identify the item and fill in what the photos actually support.

- Brand, model and serial number: report them only when they are visible in the photos or the item is unmistakable. Copy serial and model numbers exactly as printed on a label; if any character is unreadable, return null rather than guessing, and say so in the notes.
- Category: pick the closest match from the list provided, or null.
- Estimated replacement value: your best estimate in US dollars of buying the same item, or the nearest current equivalent, new today. Give the price for ONE unit. Explain the basis in one short sentence.
- Quantity: only if the photos clearly show several identical items; otherwise null.
- From receipts only: purchase date (YYYY-MM-DD), purchase price for one unit in US dollars, and the store name.
- Name: a short, specific name an insurance adjuster would recognise, e.g. "Samsung 65-inch QLED TV".
- Notes: one or two short sentences on anything uncertain that the owner should double-check. Otherwise null.

Use null for anything you cannot determine. Respond only with the JSON object.`

const nullable = (type) => ({ anyOf: [{ type }, { type: 'null' }] })

function schema() {
  return {
    type: 'object',
    properties: {
      name: nullable('string'),
      category: nullable('string'),
      brand: nullable('string'),
      model: nullable('string'),
      serial_number: nullable('string'),
      quantity: nullable('integer'),
      replacement_value: nullable('number'),
      value_basis: nullable('string'),
      purchase_date: nullable('string'),
      purchase_price: nullable('number'),
      store: nullable('string'),
      notes: nullable('string'),
    },
    required: ['name', 'category', 'brand', 'model', 'serial_number', 'quantity', 'replacement_value',
      'value_basis', 'purchase_date', 'purchase_price', 'store', 'notes'],
    additionalProperties: false,
  }
}

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
  await requireUser(req, supabaseAdmin())
  const { images = [], current = {}, categories = [] } = jsonBody(req)
  if (!Array.isArray(images) || !images.length) throw new HttpError(400, 'Add a photo of the item first')

  // Photos first, then receipts, each labelled so Claude knows which is which.
  const content = []
  for (const img of images.slice(0, MAX_IMAGES)) {
    if (!/^[A-Za-z0-9+/=]+$/.test(img.data || '')) throw new HttpError(400, 'Bad image')
    content.push({ type: 'text', text: img.kind === 'receipt' ? 'Receipt:' : 'Photo of the item:' })
    content.push(img.format === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: img.data } }
      : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.data } })
  }
  content.push({
    type: 'text',
    text:
      `Categories to choose from: ${categories.join(', ')}\n\n` +
      `Details the owner has already entered (may be empty or rough):\n${JSON.stringify(current, null, 2)}`,
  })

  try {
    const response = await createMessage(claudeClient(), {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema() } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    })
    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'The AI declined to analyse these photos. Please fill in the details by hand.')
    }
    const text = response.content.find((b) => b.type === 'text')?.text
    let suggestions
    try {
      suggestions = JSON.parse(text)
    } catch {
      throw new HttpError(502, 'The AI’s answer couldn’t be read. Please try again.')
    }
    res.status(200).json({ suggestions, costCents: costCents(response.usage) })
  } catch (err) {
    throw friendlyError(err)
  }
})
