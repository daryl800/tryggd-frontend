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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { error: latestCheckinError } = await supabase
      .from('users_latest_checkin')
      .delete()
      .eq('user_id', user.id)

    if (latestCheckinError) {
      console.error('Failed to delete users_latest_checkin row', latestCheckinError)
      return new Response(JSON.stringify({ error: 'Failed to prepare account deletion' }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)

    if (deleteError) {
      console.error('Failed to delete auth user', deleteError)
      return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
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
