// Shared helpers for talking to Claude (Anthropic's AI) from our server
// functions. The AI key (ANTHROPIC_API_KEY, set in Vercel) never leaves the
// server, and only our logged-in account can use these functions.
import Anthropic from '@anthropic-ai/sdk'
import { env, HttpError } from './server.js'

export const MODEL = 'claude-opus-5-5'

// Opus 5.5 prices (USD per million tokens) + web search, for the
// "this cost about X¢" note shown in the app.
const PRICE_IN = 4 / 1e6
const PRICE_OUT = 20 / 1e6
const PRICE_SEARCH = 10 / 1000

export function claudeClient() {
  return new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 55_000, maxRetries: 1 })
}

// Rough cost of one request, in US cents.
export function costCents(usage) {
  if (!usage) return null
  const dollars =
    (usage.input_tokens || 0) * PRICE_IN +
    (usage.cache_read_input_tokens || 0) * PRICE_IN * 0.1 +
    (usage.cache_creation_input_tokens || 0) * PRICE_IN * 1.25 +
    (usage.output_tokens || 0) * PRICE_OUT +
    (usage.server_tool_use?.web_search_requests || 0) * PRICE_SEARCH
  return Math.round(dollars * 1000) / 10 // e.g. 6.3 (cents)
}

// Send a request. If Claude's safety filter declines, Anthropic can re-run
// it on a fallback model automatically ("fallbacks: default"). That's very
// unlikely for household items; if the feature isn't accepted for some
// reason, we simply retry without it.
export async function createMessage(client, params) {
  try {
    return await client.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
      console.warn('Fallbacks not accepted; retrying without them')
      return client.beta.messages.create(params)
    }
    throw err
  }
}

// Turn Anthropic errors into short, friendly messages for the app.
export function friendlyError(err) {
  if (err instanceof HttpError) return err
  if (err instanceof Anthropic.AuthenticationError) return new HttpError(502, 'The AI key in Vercel isn’t valid (check ANTHROPIC_API_KEY)')
  if (err instanceof Anthropic.PermissionDeniedError) return new HttpError(502, 'The AI account doesn’t allow this request (check Anthropic Console)')
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, 'The AI is busy or the spending limit was reached. Try again in a minute')
  if (err instanceof Anthropic.BadRequestError && /credit|billing/i.test(err.message)) return new HttpError(402, 'The Anthropic account is out of credit')
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new HttpError(504, 'The AI took too long. Please try again')
  if (err instanceof Anthropic.APIError) {
    console.error('Anthropic error', err.status, err.message)
    return new HttpError(502, `The AI service returned an error (${err.status ?? 'network'})`)
  }
  return err
}

// Read a JSON request body (Vercel usually parses it already).
export function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  try { return JSON.parse(req.body || '{}') } catch { throw new HttpError(400, 'Bad request') }
}
