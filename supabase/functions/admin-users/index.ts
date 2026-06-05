import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AdminAction =
  | { action: 'list'; page?: number; pageSize?: number; query?: string; filter?: 'all' | 'plus' | 'new_last_7_days' | 'checked_in_today' }
  | { action: 'delete'; userId?: string; tryggdId?: string }

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

type AuthUserRow = {
  id: string
  email: string | null
  created_at: string
}

async function listAllAuthUsers(supabase: ReturnType<typeof getServiceClient>) {
  const perPage = 1000
  let page = 1
  const users: AuthUserRow[] = []

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) {
      throw error
    }

    const pageUsers = (data?.users ?? []).map((user) => ({
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
    }))

    users.push(...pageUsers)

    if (pageUsers.length < perPage) {
      break
    }

    page += 1
  }

  return users
}

async function loadStats(supabase: ReturnType<typeof getServiceClient>) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)

  const startOfTodayUtc = new Date()
  startOfTodayUtc.setUTCHours(0, 0, 0, 0)

  const [authUsers, plusUsersResult, checkedInTodayResult] = await Promise.all([
    listAllAuthUsers(supabase),
    supabase.from('user_entitlements').select('user_id', { count: 'exact', head: true }).eq('plan', 'plus'),
    supabase.from('users_latest_checkin').select('user_id', { count: 'exact', head: true }).gte('last_checked_in_utc', startOfTodayUtc.toISOString()),
  ])

  const newUsersLast7Days = authUsers.filter((user) => {
    const createdAt = new Date(user.created_at)
    return createdAt >= sevenDaysAgo
  }).length

  return {
    totalUsers: authUsers.length,
    plusUsers: plusUsersResult.count ?? 0,
    newUsersLast7Days,
    checkedInToday: checkedInTodayResult.count ?? 0,
  }
}

async function listUsers(
  supabase: ReturnType<typeof getServiceClient>,
  page = 1,
  pageSize = 20,
  query = '',
  filter: 'all' | 'plus' | 'new_last_7_days' | 'checked_in_today' = 'all'
) {
  const safePage = Math.max(1, page)
  const safePageSize = Math.min(100, Math.max(1, pageSize))
  const offset = (safePage - 1) * safePageSize
  const trimmedQuery = query.trim()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)
  const startOfTodayUtc = new Date()
  startOfTodayUtc.setUTCHours(0, 0, 0, 0)

  const authUsers = await listAllAuthUsers(supabase)
  const allIds = authUsers.map((row) => row.id)
  const { data: profiles, error: profilesError } = allIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', allIds)
    : { data: [] as Array<{ id: string; display_name: string | null; username: string | null }>, error: null }

  if (profilesError) {
    throw profilesError
  }

  const [entitlementsResult, latestCheckinsResult] = await Promise.all([
    allIds.length > 0
      ? supabase.from('user_entitlements').select('user_id, plan').in('user_id', allIds)
      : Promise.resolve({ data: [], error: null }),
    allIds.length > 0
      ? supabase.from('users_latest_checkin').select('user_id, last_checked_in_utc').in('user_id', allIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (entitlementsResult.error) {
    throw entitlementsResult.error
  }

  if (latestCheckinsResult.error) {
    throw latestCheckinsResult.error
  }

  const profileMap = new Map(
    (profiles ?? []).map((row) => [row.id, row])
  )
  const plusUserIds = new Set(
    (entitlementsResult.data ?? [])
      .filter((row) => row.plan === 'plus')
      .map((row) => row.user_id)
  )
  const checkedInTodayUserIds = new Set(
    (latestCheckinsResult.data ?? [])
      .filter((row) => new Date(row.last_checked_in_utc) >= startOfTodayUtc)
      .map((row) => row.user_id)
  )

  const normalizedQuery = trimmedQuery.toLowerCase()
  const filteredUsers = authUsers
    .map((row) => {
      const profile = profileMap.get(row.id)
      return {
        user_id: row.id,
        display_name: profile?.display_name ?? '',
        tryggd_id: profile?.username ?? '',
        email: row.email ?? '',
        account_created_at: row.created_at,
      }
    })
    .filter((row) => {
      if (filter === 'plus' && !plusUserIds.has(row.user_id)) return false
      if (filter === 'new_last_7_days' && new Date(row.account_created_at) < sevenDaysAgo) return false
      if (filter === 'checked_in_today' && !checkedInTodayUserIds.has(row.user_id)) return false

      if (!normalizedQuery) return true

      return [
        row.display_name,
        row.tryggd_id,
        row.email,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
    .sort((a, b) => new Date(b.account_created_at).getTime() - new Date(a.account_created_at).getTime())

  const pagedUsers = filteredUsers.slice(offset, offset + safePageSize)

  return {
    page: safePage,
    pageSize: safePageSize,
    totalUsers: filteredUsers.length,
    users: pagedUsers,
  }
}

async function deleteUser(
  supabase: ReturnType<typeof getServiceClient>,
  options: { userId?: string; tryggdId?: string }
) {
  const normalizedTryggdId = options.tryggdId?.trim().toLowerCase() ?? ''
  let userId = options.userId?.trim() ?? ''
  let deletedDisplayName = ''
  let deletedTryggdId = normalizedTryggdId

  if (!userId && !normalizedTryggdId) {
    return { status: 400, body: { error: 'Missing user_id or tryggd_id' } }
  }

  if (userId) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      return { status: 500, body: { error: 'Failed to look up user profile' } }
    }

    if (profile) {
      deletedDisplayName = profile.display_name ?? ''
      deletedTryggdId = profile.username ?? deletedTryggdId
    }
  } else {
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

    userId = profile.id
    deletedDisplayName = profile.display_name ?? ''
    deletedTryggdId = profile.username ?? deletedTryggdId
  }

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
      deleted_tryggd_id: deletedTryggdId,
      deleted_display_name: deletedDisplayName,
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
      const result = await deleteUser(supabase, { userId: body.userId, tryggdId: body.tryggdId })
      return new Response(JSON.stringify(result.body), { status: result.status, headers: corsHeaders })
    }

    const [stats, listResult] = await Promise.all([
      loadStats(supabase),
      listUsers(supabase, body.page, body.pageSize, body.query, body.filter),
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
