// supabase/functions/check-reminder-status/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Check if user has checked in today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: checkin, error: checkinError } = await supabase
      .from('checkins')
      .select('id')
      .eq('user_id', user.id)
      .gte('checked_in_at_utc', today.toISOString())
      .maybeSingle()

    if (checkinError) throw checkinError

    return new Response(
      JSON.stringify({
        checkedInToday: !!checkin,
        userId: user.id
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})