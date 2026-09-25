// "Look up current price": Claude searches the web for what this item
// costs new today, and returns one price with the page it came from.
import { handle, HttpError, supabaseAdmin, requireUser } from '../_lib/server.js'
import { MODEL, claudeClient, createMessage, costCents, friendlyError, jsonBody } from '../_lib/claude.js'

const SYSTEM = `You help a homeowner document replacement values for an insurance inventory. Search the web for what it costs to buy the described item new today in the United States. If it is no longer sold, find the closest current equivalent. Prefer major retailers or the manufacturer's own store. Then call report_price with the best single price for ONE unit, the web address of the product page you found it on, and a short note naming the store and saying whether it is an exact match or an equivalent.`

const REPORT_TOOL = {
  name: 'report_price',
  description: 'Report the current replacement price found for the item.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      price: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Price in US dollars for one unit, or null if none was found' },
      product_url: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Web address of the product page' },
      store: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      match: { type: 'string', enum: ['exact', 'equivalent', 'not_found'] },
      note: { type: 'string', description: 'One short sentence for the owner' },
    },
    required: ['price', 'product_url', 'store', 'match', 'note'],
    additionalProperties: false,
  },
}

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
  await requireUser(req, supabaseAdmin())
  const { item = {} } = jsonBody(req)
  const describe = ['name', 'brand', 'model', 'category']
    .filter((k) => item[k]).map((k) => `${k}: ${item[k]}`).join('\n')
  if (!item.name && !item.brand && !item.model) {
    throw new HttpError(400, 'Add a name (or use “Suggest details”) before looking up a price')
  }

  const client = claudeClient()
  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    system: SYSTEM,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }, REPORT_TOOL],
    tool_choice: { type: 'auto' },
  }
  const messages = [{ role: 'user', content: `Find the current price of this item:\n${describe}` }]
  const usages = []

  try {
    // Web searches can pause a long turn; continue it (at most a few times).
    for (let round = 0; round < 4; round++) {
      const response = await createMessage(client, { ...params, messages })
      usages.push(response.usage)
      if (response.stop_reason === 'refusal') {
        throw new HttpError(422, 'The AI declined this lookup. Please look the price up by hand.')
      }
      const call = response.content.find((b) => b.type === 'tool_use' && b.name === 'report_price')
      if (call) {
        const cents = usages.reduce((s, u) => s + (costCents(u) || 0), 0)
        return res.status(200).json({ result: call.input, costCents: Math.round(cents * 10) / 10 })
      }
      // Keep the conversation append-only. A paused turn is continued by
      // sending Claude's partial turn back; a continuation extends that same
      // assistant turn rather than starting a second one.
      const last = messages[messages.length - 1]
      if (last.role === 'assistant') last.content = [...last.content, ...response.content]
      else messages.push({ role: 'assistant', content: response.content })
      if (response.stop_reason !== 'pause_turn') {
        messages.push({ role: 'user', content: 'Please call report_price with what you found.' })
      }
    }
    throw new HttpError(502, 'The price lookup didn’t finish. Please try again.')
  } catch (err) {
    throw friendlyError(err)
  }
})
