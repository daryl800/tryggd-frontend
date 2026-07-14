// supabase/functions/resolve-watchover-episode/index.ts
//
// Called by a watcher who has been in touch with the watched person.
// Marks the active episode as resolved and notifies the watched user (optional).
//
// POST body: { episode_id: string }
// Auth: JWT required (the watcher's session)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  let body: { episode_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders })
  }

  const { episode_id } = body
  if (!episode_id) {
    return new Response(JSON.stringify({ error: 'episode_id is required' }), { status: 400, headers: corsHeaders })
  }

  // Load the episode and verify the caller is a watcher of that person
  const { data: episode, error: epErr } = await supabase
    .from('watch_over_episodes')
    .select('id, watched_user_id, status')
    .eq('id', episode_id)
    .single()

  if (epErr || !episode) {
    return new Response(JSON.stringify({ error: 'Episode not found' }), { status: 404, headers: corsHeaders })
  }

  if (episode.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Episode is not active', status: episode.status }), {
      status: 409, headers: corsHeaders
    })
  }

  // Verify caller watches this person
  const { data: contactRow } = await supabase
    .from('contacts')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('contact_user_id', episode.watched_user_id)
    .eq('watch_over_enabled', true)
    .maybeSingle()

  if (!contactRow) {
    return new Response(JSON.stringify({ error: 'Not authorized to resolve this episode' }), {
      status: 403, headers: corsHeaders
    })
  }

  // Mark episode as resolved
  const { error: updateErr } = await supabase
    .from('watch_over_episodes')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: user.id,
    })
    .eq('id', episode_id)

  if (updateErr) {
    console.error('Failed to resolve episode', updateErr)
    return new Response(JSON.stringify({ error: 'Failed to resolve episode' }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
})
