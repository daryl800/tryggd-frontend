// supabase/functions/send-checkin-notifications/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Expo } from 'https://esm.sh/expo-server-sdk@3.6.0'

interface CheckinPayload {
  user_id: string
  checkin_time: string
  timezone: string
}

type NotificationPayload = {
  title: string
  body: string
  type: string
  data: Record<string, any>
}

// ============================================
// AUTH FUNCTION (embedded directly)
// ============================================
async function validateAndGetUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.replace('Bearer ', '')
  
  // Quick token format check
  if (token.split('.').length !== 3) {
    console.error('Malformed token - invalid segment count:', token.split('.').length)
    return { user: null, error: 'Invalid token format', status: 401 }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    console.error('Auth error:', authError?.message)
    return { user: null, error: 'Invalid or expired token', status: 401 }
  }

  return { user, error: null, status: 200 }
}

// Capitalize first letter
function capitalizeName(name: string) {
  if (!name) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// Notification payload builder
function buildContactCheckinNotification(
  contactDisplayName: string,
  formattedTime: string,
  user_id: string,
  owner_user_id: string,
  checkin_time: string,
  timezone: string
): NotificationPayload {
  return {
    title: `🎯 ${contactDisplayName} checked in.`,
    body: `Everything is fine! - ${formattedTime}`,
    type: 'contact_checkin',
    data: {
      contactUserId: user_id,
      ownerUserId: owner_user_id,
      checkinTime: formattedTime,
      contactDisplayName,
      timezone
    }
  }
}

serve(async (req) => {
  try {
    // ============================================
    // 1. Authentication
    // ============================================
    const { user, error: authError, status } = await validateAndGetUser(req)
    
    if (!user) {
      console.error('Auth error:', authError)
      return new Response(JSON.stringify({ 
        error: authError,
        code: 'auth_failed'
      }), { 
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // ============================================
    // 2. Parse request body
    // ============================================
    const { user_id, checkin_time, timezone } = await req.json() as CheckinPayload
    console.log('🚀 Contact check-in notification started', { user_id, checkin_time, timezone })

    // Verify the authenticated user matches the payload
    if (user.id !== user_id) {
      return new Response(JSON.stringify({ 
        error: 'User ID mismatch',
        code: 'forbidden'
      }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // ============================================
    // 3. Initialize Supabase client
    // ============================================
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // ============================================
    // 4. Rate limit (60 seconds cooldown)
    // ============================================
    const now = new Date()
    const cooldownSeconds = 60

    const { data: rateLimit } = await supabase
      .from('notification_rate_limits')
      .select('last_contact_checkin_push_at')
      .eq('user_id', user_id)
      .single()

    if (rateLimit?.last_contact_checkin_push_at) {
      const lastPush = new Date(rateLimit.last_contact_checkin_push_at)
      const diffSeconds = (now.getTime() - lastPush.getTime()) / 1000

      if (diffSeconds < cooldownSeconds) {
        console.log('⛔ Push skipped (cooldown active)')
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          reason: 'cooldown_active'
        }), { status: 200 })
      }
    }

    // ============================================
    // 5. Find contacts
    // ============================================
    const { data: contactRelationships, error: contactsError } = await supabase
      .from('contacts')
      .select('owner_user_id, contact_display_name')
      .eq('contact_user_id', user_id)

    if (contactsError) throw contactsError

    if (!contactRelationships?.length) {
      console.log('⏩ No contacts found')
      return new Response(JSON.stringify({ message: 'No contacts found' }), { status: 200 })
    }

    console.log(`✅ Found ${contactRelationships.length} contacts`)

    // ============================================
    // 6. Get checking-in user profile
    // ============================================
    const { data: checkingUser } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('id', user_id)
      .single()

    const checkingUserName =
      capitalizeName(checkingUser?.display_name ||
        checkingUser?.email?.split('@')[0] ||
        'Someone')

    console.log('👤 Checking user:', checkingUserName)

    // ============================================
    // 7. Get push tokens
    // ============================================
    const ownerIds = contactRelationships.map(rel => rel.owner_user_id)

    const { data: owners, error: tokensError } = await supabase
      .from('user_push_tokens')
      .select('user_id, expo_push_token, contact_checkin_notifications')
      .in('user_id', ownerIds)
      .eq('contact_checkin_notifications', true)
      .not('expo_push_token', 'is', null)

    if (tokensError) throw tokensError

    if (!owners?.length) {
      console.log('⏩ No push tokens found')
      return new Response(JSON.stringify({ message: 'No push tokens found' }), { status: 200 })
    }

    console.log(`✅ Found ${owners.length} owners with tokens`)

    // ============================================
    // 8. Format time
    // ============================================
    const formattedTime = new Date(checkin_time).toLocaleString('en-GB', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    })

    const ownerContactMap = new Map(
      contactRelationships.map(rel => [
        rel.owner_user_id,
        capitalizeName(rel.contact_display_name || checkingUserName)
      ])
    )

    // ============================================
    // 9. Build notifications
    // ============================================
    const notificationsToInsert = []
    const messages = []

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')

    for (const owner of owners) {
      const contactDisplayName =
        ownerContactMap.get(owner.user_id) || checkingUserName

      const payload = buildContactCheckinNotification(
        contactDisplayName,
        formattedTime,
        user_id,
        owner.user_id,
        checkin_time,
        timezone
      )

      notificationsToInsert.push({
        user_id: owner.user_id,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sender_user_id: user_id,
        read: false,
        created_at: new Date().toISOString()
      })

      if (owner.expo_push_token && Expo.isExpoPushToken(owner.expo_push_token)) {
        messages.push({
          to: owner.expo_push_token,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: payload.data,
          channelId: 'contact-checkins',
          priority: 'high',
          badge: 1
        })
      }
    }

    // ============================================
    // 10. Save to notifications table
    // ============================================
    console.log(`💾 Saving ${notificationsToInsert.length} notifications`)
    if (notificationsToInsert.length > 0) {
      await supabase.from('notifications').insert(notificationsToInsert)
    }

    // ============================================
    // 11. Send push notifications
    // ============================================
    console.log(`📱 Sending ${messages.length} push notifications`)

    const successfulPushes = []
    const failedPushes = []

    for (const message of messages) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        }

        if (expoAccessToken) {
          headers['Authorization'] = `Bearer ${expoAccessToken}`
        }

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers,
          body: JSON.stringify(message)
        })

        const result = await response.json()

        if (response.ok) {
          console.log(`✅ Push sent to ${message.to.substring(0, 15)}...`)
          successfulPushes.push(result)
        } else {
          console.error(`❌ Push failed`, result)
          failedPushes.push(result)
        }

      } catch (err) {
        console.error(`❌ Push exception`, err)
        failedPushes.push(err)
      }
    }

    // ============================================
    // 12. Update rate limit
    // ============================================
    if (successfulPushes.length > 0) {
      await supabase
        .from('notification_rate_limits')
        .upsert(
          {
            user_id: user_id,
            last_contact_checkin_push_at: now.toISOString()
          },
          { onConflict: 'user_id' }
        )
    }

    // ============================================
    // 13. Return success
    // ============================================
    console.log('✅ Notification process completed', {
      pushes_sent: successfulPushes.length,
      pushes_failed: failedPushes.length
    })

    return new Response(JSON.stringify({
      success: true,
      pushes_sent: successfulPushes.length,
      pushes_failed: failedPushes.length
    }), { status: 200 })

  } catch (error) {
    console.error('💥 FATAL ERROR:', error)
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), { status: 500 })
  }
})