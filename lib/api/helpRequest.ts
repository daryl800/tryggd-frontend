// lib/api/helpRequest.ts
import { supabase } from '../supabase'

const SEND_HELP_REQUEST_URL =
  'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-help-request'

export type HelpRequestType = 'call_me_now' | 'money_transfer_help'

export type HelpRequest = {
  id: string
  user_id: string
  type: HelpRequestType
  created_at: string
  status: string
}

export async function sendHelpRequest(type: HelpRequestType): Promise<{ help_request_id: string; created_at: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const response = await fetch(SEND_HELP_REQUEST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type }),
  })

  const json = await response.json()

  if (!response.ok) {
    throw new Error(json?.error ?? 'Failed to send help request')
  }

  return json
}

export async function fetchLastHelpRequest(userId: string): Promise<HelpRequest | null> {
  const { data } = await supabase
    .from('help_requests')
    .select('id, user_id, type, created_at, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

// Per-type lookup — used so each button can show its own last-sent time.
// A user can press both buttons within a short window, and each needs its
// own timestamp rather than one shared "last request" line hiding the other.
export async function fetchLastHelpRequestByType(
  userId: string,
  type: HelpRequestType
): Promise<HelpRequest | null> {
  const { data } = await supabase
    .from('help_requests')
    .select('id, user_id, type, created_at, status')
    .eq('user_id', userId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? null
}
