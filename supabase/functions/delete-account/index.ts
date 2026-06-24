import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const jsonHeaders = {
  'Content-Type': 'application/json',
}

async function validateAndGetUser(req: Request) {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return { user: null, error: 'Invalid or expired token', status: 401 }
  }

  return { user, error: null, status: 200 }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: jsonHeaders })
  }

  try {
    const { user, error: authError, status } = await validateAndGetUser(req)

    if (!user) {
      return new Response(JSON.stringify({ error: authError }), {
        status,
        headers: jsonHeaders,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    // Delete app data BEFORE deleting the auth user.
    // users_latest_checkin has a FK → profiles, and profiles cascades from auth.users,
    // so users_latest_checkin must be cleared first or the auth deletion is blocked.
    const cleanupOperations = [
      supabase.from('users_latest_checkin').delete().eq('user_id', user.id),
      supabase.from('checkins').delete().eq('user_id', user.id),
      supabase.from('contacts').delete().or(`owner_user_id.eq.${user.id},contact_user_id.eq.${user.id}`),
      supabase.from('contact_requests').delete().or(`sender_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`),
      supabase.from('contact_invites').delete().or(`inviter_user_id.eq.${user.id},target_user_id.eq.${user.id},claimed_by_user_id.eq.${user.id}`),
      supabase.from('notifications').delete().or(`user_id.eq.${user.id},sender_user_id.eq.${user.id}`),
      supabase.from('notification_rate_limits').delete().eq('sender_user_id', user.id),
      supabase.from('user_push_tokens').delete().eq('user_id', user.id),
      supabase.from('user_reminder_times').delete().eq('user_id', user.id),
      supabase.from('user_settings').delete().eq('user_id', user.id),
      supabase.from('user_entitlements').delete().eq('user_id', user.id),
      supabase.from('profiles').delete().eq('id', user.id),
    ]

    const cleanupResults = await Promise.all(cleanupOperations)
    const failedCleanup = cleanupResults.find((result) => result.error)
    if (failedCleanup?.error) {
      console.warn('Pre-deletion cleanup had an error', failedCleanup.error)
    }

    const deleteAuthResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
    })

    if (!deleteAuthResponse.ok) {
      const body = await deleteAuthResponse.text().catch(() => '')
      console.error('Failed to delete auth user', deleteAuthResponse.status, body)
      return new Response(JSON.stringify({
        error: 'Failed to delete account',
        details: body,
        status: deleteAuthResponse.status,
        user_id: user.id,
      }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    })
  } catch (error) {
    console.error('Unexpected delete-account error', error)
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500,
      headers: jsonHeaders,
    })
  }
})
