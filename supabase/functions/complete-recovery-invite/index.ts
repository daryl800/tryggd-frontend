import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type CompleteRecoveryPayload = {
  token: string
  code: string
  password: string
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function buildSyntheticEmailFromUsername(username: string): string {
  return `tryggdid-${username.trim().toLowerCase().replace(/\s+/g, '')}@login.tryggd.local`
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const payload = await req.json() as CompleteRecoveryPayload
    const token = payload.token?.trim()
    const code = payload.code?.trim()
    const password = payload.password || ''

    if (!token || !code || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Missing or invalid recovery fields.' }), {
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
      .select('id, invite_kind, target_user_id, invite_code_hash, status, failed_attempts, expires_at')
      .eq('invite_token', token)
      .maybeSingle()

    if (inviteError) throw inviteError
    if (!invite || invite.invite_kind !== 'recovery' || !invite.target_user_id) {
      return new Response(JSON.stringify({ error: 'Recovery invite not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (invite.status === 'claimed') {
      return new Response(JSON.stringify({ error: 'This recovery invite has already been used.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (invite.status === 'revoked' || invite.failed_attempts >= 5) {
      return new Response(JSON.stringify({ error: 'This recovery invite is no longer valid.' }), {
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

      return new Response(JSON.stringify({ error: 'This recovery invite has expired.' }), {
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
          ? 'Too many incorrect attempts. Ask for a new recovery invite.'
          : 'The code is incorrect.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: targetProfile, error: targetProfileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', invite.target_user_id)
      .maybeSingle()

    if (targetProfileError) throw targetProfileError
    if (!targetProfile?.username) {
      return new Response(JSON.stringify({ error: 'This account does not have a Tryggd ID.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { error: updateUserError } = await supabase.auth.admin.updateUserById(
      invite.target_user_id,
      { password }
    )

    if (updateUserError) {
      return new Response(JSON.stringify({ error: updateUserError.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { error: claimError } = await supabase
      .from('contact_invites')
      .update({
        status: 'claimed',
        claimed_by_user_id: invite.target_user_id,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invite.id)
      .eq('status', 'pending')

    if (claimError) throw claimError

    return new Response(JSON.stringify({
      success: true,
      auth_email: buildSyntheticEmailFromUsername(targetProfile.username),
      username: targetProfile.username,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('complete-recovery-invite fatal error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
