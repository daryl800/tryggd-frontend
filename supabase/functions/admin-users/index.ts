import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AdminAction =
  | { action: 'list'; page?: number; pageSize?: number; query?: string }
  | { action: 'delete'; tryggdId?: string }

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )
}

function getAllowedAdminEmails() {
  return (Deno.env.get('ADMIN_DASHBOARD_EMAILS') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

async function validateAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.replace('Bearer ', '')
  const supabase = getServiceClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { user: null, error: 'Invalid or expired token', status: 401 }
  }

  const allowedEmails = getAllowedAdminEmails()
  const userEmail = user.email?.toLowerCase() ?? ''

  if (allowedEmails.length === 0 || !allowedEmails.includes(userEmail)) {
    return { user: null, error: 'Forbidden', status: 403 }
  }

  return { user, error: null, status: 200 }
}

async function loadStats(supabase: ReturnType<typeof getServiceClient>) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)

  const startOfTodayUtc = new Date()
  startOfTodayUtc.setUTCHours(0, 0, 0, 0)

  const [totalUsersResult, plusUsersResult, recentUsersResult, checkedInTodayResult] = await Promise.all([
    supabase.schema('auth').from('users').select('id', { count: 'exact', head: true }),
    supabase.from('user_entitlements').select('user_id', { count: 'exact', head: true }).eq('plan', 'plus'),
    supabase.schema('auth').from('users').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString()),
    supabase.from('users_latest_checkin').select('user_id', { count: 'exact', head: true }).gte('last_checked_in_utc', startOfTodayUtc.toISOString()),
  ])

  return {
    totalUsers: totalUsersResult.count ?? 0,
    plusUsers: plusUsersResult.count ?? 0,
    newUsersLast7Days: recentUsersResult.count ?? 0,
    checkedInToday: checkedInTodayResult.count ?? 0,
  }
}

async function listUsers(supabase: ReturnType<typeof getServiceClient>, page = 1, pageSize = 20, query = '') {
  const safePage = Math.max(1, page)
  const safePageSize = Math.min(100, Math.max(1, pageSize))
  const offset = (safePage - 1) * safePageSize
  const trimmedQuery = query.trim()

  let authRows: Array<{ id: string; email: string | null; created_at: string }> = []
  let totalUsers = 0

  if (trimmedQuery) {
    const [profileMatches, emailMatches] = await Promise.all([
      supabase
        .from('profiles')
        .select('id')
        .or(`display_name.ilike.%${trimmedQuery}%,username.ilike.%${trimmedQuery}%`)
        .limit(200),
      supabase
        .schema('auth')
        .from('users')
        .select('id')
        .ilike('email', `%${trimmedQuery}%`)
        .limit(200),
    ])

    const matchedIds = [...new Set([
      ...(profileMatches.data?.map((row) => row.id) ?? []),
      ...(emailMatches.data?.map((row) => row.id) ?? []),
    ])]

    totalUsers = matchedIds.length

    if (matchedIds.length > 0) {
      const { data } = await supabase
        .schema('auth')
        .from('users')
        .select('id, email, created_at')
        .in('id', matchedIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + safePageSize - 1)

      authRows = data ?? []
    }
  } else {
    const { data, count } = await supabase
      .schema('auth')
      .from('users')
      .select('id, email, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + safePageSize - 1)

    authRows = data ?? []
    totalUsers = count ?? 0
  }

  const ids = authRows.map((row) => row.id)
  const { data: profiles } = ids.length > 0
    ? await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', ids)
    : { data: [] as Array<{ id: string; display_name: string | null; username: string | null }> }

  const profileMap = new Map(
    (profiles ?? []).map((row) => [row.id, row])
  )

  return {
    page: safePage,
    pageSize: safePageSize,
    totalUsers,
    users: authRows.map((row) => {
      const profile = profileMap.get(row.id)
      return {
        user_id: row.id,
        display_name: profile?.display_name ?? '',
        tryggd_id: profile?.username ?? '',
        email: row.email ?? '',
        account_created_at: row.created_at,
      }
    }),
  }
}

async function deleteUserByTryggdId(supabase: ReturnType<typeof getServiceClient>, tryggdId: string) {
  const normalizedTryggdId = tryggdId.trim().toLowerCase()

  if (!normalizedTryggdId) {
    return { status: 400, body: { error: 'Missing tryggd_id' } }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', normalizedTryggdId)
    .maybeSingle()

  if (profileError) {
    return { status: 500, body: { error: 'Failed to look up user' } }
  }

  if (!profile) {
    return { status: 404, body: { error: 'User not found' } }
  }

  const userId = profile.id

  const operations = [
    supabase.from('contacts').delete().or(`owner_user_id.eq.${userId},contact_user_id.eq.${userId}`),
    supabase.from('contact_requests').delete().or(`sender_user_id.eq.${userId},receiver_user_id.eq.${userId}`),
    supabase.from('contact_invites').delete().or(`inviter_user_id.eq.${userId},target_user_id.eq.${userId},claimed_by_user_id.eq.${userId}`),
    supabase.from('notifications').delete().or(`user_id.eq.${userId},sender_user_id.eq.${userId}`),
    supabase.from('notification_rate_limits').delete().eq('sender_user_id', userId),
    supabase.from('user_push_tokens').delete().eq('user_id', userId),
    supabase.from('user_reminder_times').delete().eq('user_id', userId),
    supabase.from('user_settings').delete().eq('user_id', userId),
    supabase.from('user_entitlements').delete().eq('user_id', userId),
    supabase.from('checkins').delete().eq('user_id', userId),
    supabase.from('users_latest_checkin').delete().eq('user_id', userId),
    supabase.from('profiles').delete().eq('id', userId),
  ]

  const results = await Promise.all(operations)
  const failedResult = results.find((result) => result.error)

  if (failedResult?.error) {
    console.error('Failed during user deletion', failedResult.error)
    return { status: 500, body: { error: 'Failed to delete user data' } }
  }

  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId)

  if (deleteAuthError) {
    console.error('Failed to delete auth user', deleteAuthError)
    return { status: 500, body: { error: 'Failed to delete auth user' } }
  }

  return {
    status: 200,
    body: {
      success: true,
      deleted_user_id: userId,
      deleted_tryggd_id: normalizedTryggdId,
      deleted_display_name: profile.display_name ?? '',
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user, error, status } = await validateAdmin(req)

    if (!user) {
      return new Response(JSON.stringify({ error }), { status, headers: corsHeaders })
    }

    const body = await req.json() as AdminAction
    const supabase = getServiceClient()

    if (body.action === 'delete') {
      const result = await deleteUserByTryggdId(supabase, body.tryggdId ?? '')
      return new Response(JSON.stringify(result.body), { status: result.status, headers: corsHeaders })
    }

    const [stats, listResult] = await Promise.all([
      loadStats(supabase),
      listUsers(supabase, body.page, body.pageSize, body.query),
    ])

    return new Response(JSON.stringify({ stats, ...listResult }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Unexpected admin-users error', error)
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
