import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type RegisterInvitePayload = {
  token: string
  code: string
  display_name: string
  phone?: string
  password: string
  username: string
}

type UserPlan = 'free' | 'plus'

function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const collapsed = trimmed.replace(/[\s\-().]/g, '')
  const normalized =
    collapsed.startsWith('00') ? `+${collapsed.slice(2)}` :
    collapsed.startsWith('+') ? collapsed :
    `+${collapsed}`

  const digitsOnly = normalized.replace(/[^\d]/g, '')
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return null
  }

  return `+${digitsOnly}`
}

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '')
}

function isValidUsername(input: string): boolean {
  return /^[a-z0-9._]{3,24}$/.test(normalizeUsername(input))
}

function buildSyntheticEmailFromUsername(username: string): string {
  return `tryggdid-${normalizeUsername(username)}@login.tryggd.local`
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function getUserPlan(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<UserPlan> {
  const { data, error } = await supabase
    .from('user_entitlements')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load inviter plan, defaulting to free:', error.message)
    return 'free'
  }

  return data?.plan === 'plus' ? 'plus' : 'free'
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const payload = await req.json() as RegisterInvitePayload
    const token = payload.token?.trim()
    const code = payload.code?.trim()
    const displayName = payload.display_name?.trim()
    const username = normalizeUsername(payload.username || '')
    const password = payload.password || ''
    const normalizedPhone = payload.phone?.trim() ? normalizePhoneNumber(payload.phone) : null

    if (!token || !code || !displayName || !isValidUsername(username) || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Missing or invalid registration fields.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (payload.phone?.trim() && !normalizedPhone) {
      return new Response(JSON.stringify({ error: 'Invalid phone number.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: invite, error: inviteError } = await supabase
      .from('contact_invites')
      .select('id, inviter_user_id, invite_code_hash, invitee_name, status, failed_attempts, expires_at, claimed_by_user_id')
      .eq('invite_token', token)
      .maybeSingle()

    if (inviteError) throw inviteError
    if (!invite) {
      return new Response(JSON.stringify({ error: 'Invite not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (invite.status === 'claimed') {
      return new Response(JSON.stringify({ error: 'This invite has already been used.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (invite.status === 'revoked' || invite.failed_attempts >= 5) {
      return new Response(JSON.stringify({ error: 'This invite is no longer valid.' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = new Date(invite.expires_at)
    if (expiresAt.getTime() <= Date.now()) {
      await supabase
        .from('contact_invites')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', invite.id)

      return new Response(JSON.stringify({ error: 'This invite has expired.' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const submittedCodeHash = await sha256Hex(code)
    if (submittedCodeHash !== invite.invite_code_hash) {
      const nextAttempts = invite.failed_attempts + 1
      await supabase
        .from('contact_invites')
        .update({
          failed_attempts: nextAttempts,
          status: nextAttempts >= 5 ? 'revoked' : invite.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invite.id)

      return new Response(JSON.stringify({
        error: nextAttempts >= 5
          ? 'Too many incorrect attempts. Ask for a new invite.'
          : 'The code is incorrect.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const authEmail = buildSyntheticEmailFromUsername(username)

    if (normalizedPhone) {
      const { data: existingPhoneProfile, error: phoneLookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalizedPhone)
        .maybeSingle()

      if (phoneLookupError) throw phoneLookupError
      if (existingPhoneProfile) {
        return new Response(JSON.stringify({ error: 'This phone number is already in use.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: existingUsername, error: usernameLookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (usernameLookupError) throw usernameLookupError
    if (existingUsername) {
      return new Response(JSON.stringify({ error: 'That Tryggd ID is already taken.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: inviterProfile, error: inviterProfileError } = await supabase
      .from('profiles')
      .select('display_name, username, phone')
      .eq('id', invite.inviter_user_id)
      .maybeSingle()

    if (inviterProfileError) throw inviterProfileError

    const inviterPlan = await getUserPlan(supabase, invite.inviter_user_id)
    if (inviterPlan !== 'plus') {
      const { count: inviterContactCount, error: inviterContactCountError } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', invite.inviter_user_id)

      if (inviterContactCountError) throw inviterContactCountError
      if ((inviterContactCount || 0) >= 3) {
        return new Response(JSON.stringify({
          error: 'This invite can no longer be claimed because the inviter has reached the free contact limit.',
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: createdUserData, error: createUserError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
      },
    })

    if (createUserError || !createdUserData.user) {
      return new Response(JSON.stringify({
        error: createUserError?.message || 'Failed to create the invited account.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const createdUser = createdUserData.user

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: createdUser.id,
          display_name: displayName,
          username,
          phone: normalizedPhone,
          avatar_url: '',
        })

      if (profileError) throw profileError

      const inviterDisplayName =
        inviterProfile?.display_name ||
        inviterProfile?.username ||
        'Tryggd contact'

      const inviteeIdentifier = username
      const inviterIdentifier = inviterProfile?.username || inviterProfile?.phone || ''

      const { error: contactsError } = await supabase
        .from('contacts')
        .upsert([
          {
            owner_user_id: invite.inviter_user_id,
            contact_user_id: createdUser.id,
            contact_email: inviteeIdentifier,
            contact_display_name: displayName,
          },
          {
            owner_user_id: createdUser.id,
            contact_user_id: invite.inviter_user_id,
            contact_email: inviterIdentifier,
            contact_display_name: inviterDisplayName,
          },
        ])

      if (contactsError) throw contactsError

      const { error: claimError } = await supabase
        .from('contact_invites')
        .update({
          status: 'claimed',
          claimed_by_user_id: createdUser.id,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invite.id)
        .eq('status', 'pending')

      if (claimError) throw claimError

      return new Response(JSON.stringify({
        success: true,
        phone: normalizedPhone,
        auth_email: authEmail,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      await supabase.auth.admin.deleteUser(createdUser.id)
      throw error
    }
  } catch (error) {
    console.error('register-invited-user fatal error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
