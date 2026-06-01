// supabase/functions/send-checkin-notifications/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Expo } from 'https://esm.sh/expo-server-sdk@3.6.0'

interface CheckinPayload {
  user_id: string
  checkin_time: string
  timezone: string
}

type SharedLocation = {
  latitude: number
  longitude: number
  accuracyMeters: number | null
}

type AuthorizedRequest =
  | { kind: 'user'; userId: string }
  | { kind: 'internal' }

type NotificationPayload = {
  title: string
  body: string
  type: string
  data: Record<string, any>
}

function getInternalTriggerKey() {
  return (
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    null
  )
}

// ============================================
// AUTH FUNCTION (embedded directly)
// ============================================
async function validateRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  payloadUserId: string
): Promise<{ auth: AuthorizedRequest | null; error: string | null; status: number }> {
  const authHeader = req.headers.get('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { auth: null, error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.replace('Bearer ', '')

  if (token.split('.').length === 3) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (!authError && user) {
      if (user.id !== payloadUserId) {
        return { auth: null, error: 'User ID mismatch', status: 403 }
      }

      return { auth: { kind: 'user', userId: user.id }, error: null, status: 200 }
    }

    console.error('JWT auth error:', authError?.message)
  }

  const internalTriggerKey = getInternalTriggerKey()
  if (internalTriggerKey && token === internalTriggerKey) {
    console.log('🔐 Authorized internal trigger request')
    return { auth: { kind: 'internal' }, error: null, status: 200 }
  }

  return { auth: null, error: 'Invalid or expired token', status: 401 }
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
  timezone: string,
  location: SharedLocation | null
): NotificationPayload {
  const data: Record<string, any> = {
    contactUserId: user_id,
    ownerUserId: owner_user_id,
    checkinTime: formattedTime,
    checkinTimeIso: checkin_time,
    contactDisplayName,
    timezone
  }

  if (location) {
    data.location = location
  }

  return {
    title: `🎯 ${contactDisplayName} checked in.`,
    body: `All is well! - ${formattedTime}`,
    type: 'contact_checkin',
    data
  }
}

serve(async (req) => {
  try {
    // ============================================
    // 1. Initialize Supabase client
    // ============================================
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // ============================================
    // 2. Parse request body
    // ============================================
    const { user_id, checkin_time, timezone } = await req.json() as CheckinPayload
    console.log('🚀 Contact check-in notification started', { user_id, checkin_time, timezone })

    // ============================================
    // 3. Authentication
    // ============================================
    const { auth, error: authError, status } = await validateRequest(req, supabase, user_id)
    
    if (!auth) {
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
    // 4. Rate limit (60 seconds cooldown)
    // ============================================
    const now = new Date()
    const cooldownSeconds = 60

    const { data: rateLimit } = await supabase
      .from('notification_rate_limits')
      .select('last_contact_checkin_push_at')
      .eq('user_id', user_id)
      .single()

    console.log('🕒 Rate limit row:', rateLimit)

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
      .select('contact_user_id, location_sharing_enabled')
      .eq('owner_user_id', user_id)
      .neq('checkin_notifications_enabled', false)

    if (contactsError) throw contactsError

    if (!contactRelationships?.length) {
      console.log('⏩ No eligible contacts selected by sender')
      return new Response(JSON.stringify({ message: 'No eligible contacts selected by sender' }), { status: 200 })
    }

    console.log(`✅ Found ${contactRelationships.length} contacts`)
    console.log('📋 Eligible contact relationships:', contactRelationships)

    const { data: latestCheckinRow, error: latestCheckinError } = await supabase
      .from('checkins')
      .select('location_latitude, location_longitude, location_accuracy_meters, checked_in_at_utc')
      .eq('user_id', user_id)
      .order('checked_in_at_utc', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestCheckinError) {
      throw latestCheckinError
    }

    const sharedLocation: SharedLocation | null =
      latestCheckinRow?.location_latitude != null && latestCheckinRow?.location_longitude != null
        ? {
            latitude: latestCheckinRow.location_latitude,
            longitude: latestCheckinRow.location_longitude,
            accuracyMeters: latestCheckinRow.location_accuracy_meters ?? null,
          }
        : null

    const locationRecipientIds = new Set(
      (contactRelationships || [])
        .filter((relationship) => relationship.location_sharing_enabled === true)
        .map((relationship) => relationship.contact_user_id)
    )

    // ============================================
    // 6. Get checking-in user profile
    // ============================================
    const { data: checkingUser } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', user_id)
      .single()

    const checkingUserName =
      capitalizeName(checkingUser?.display_name ||
        checkingUser?.username ||
        'Someone')

    console.log('👤 Checking user:', checkingUserName)

    // ============================================
    // 7. Get push tokens
    // ============================================
    const recipientIds = contactRelationships.map(rel => rel.contact_user_id)
    console.log('📋 Recipient IDs:', recipientIds)

    const { data: existingNotifications, error: existingNotificationsError } = await supabase
      .from('notifications')
      .select('user_id')
      .in('user_id', recipientIds)
      .eq('sender_user_id', user_id)
      .eq('type', 'contact_checkin')
      .filter('data->>checkinTimeIso', 'eq', checkin_time)

    if (existingNotificationsError) throw existingNotificationsError

    const alreadyNotifiedUserIds = new Set(
      (existingNotifications || []).map((notification) => notification.user_id)
    )

    if (alreadyNotifiedUserIds.size > 0) {
      console.log('🧾 Existing notifications found for recipients:', [...alreadyNotifiedUserIds])
    }

    const { data: recipients, error: tokensError } = await supabase
      .from('user_push_tokens')
      .select('user_id, expo_push_token, contact_checkin_notifications')
      .in('user_id', recipientIds)
      .eq('contact_checkin_notifications', true)
      .not('expo_push_token', 'is', null)

    if (tokensError) throw tokensError

    if (!recipients?.length) {
      console.log('⏩ No push tokens found')
      return new Response(JSON.stringify({ message: 'No push tokens found' }), { status: 200 })
    }

    console.log(`✅ Found ${recipients.length} recipients with tokens`)
    console.log(
      '📋 Recipients with tokens:',
      recipients.map((recipient) => ({
        user_id: recipient.user_id,
        has_token: !!recipient.expo_push_token,
        contact_checkin_notifications: recipient.contact_checkin_notifications,
      }))
    )

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

    // ============================================
    // 9. Build notifications
    // ============================================
    const notificationsToInsert = []
    const messages = []

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')

    for (const recipient of recipients) {
      if (alreadyNotifiedUserIds.has(recipient.user_id)) {
        console.log(`⏩ Skipping duplicate notification for ${recipient.user_id}`)
        continue
      }

      const payload = buildContactCheckinNotification(
        checkingUserName,
        formattedTime,
        user_id,
        recipient.user_id,
        checkin_time,
        timezone,
        sharedLocation && locationRecipientIds.has(recipient.user_id)
          ? sharedLocation
          : null
      )

      notificationsToInsert.push({
        user_id: recipient.user_id,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sender_user_id: user_id,
        read: false,
        created_at: new Date().toISOString()
      })

      if (recipient.expo_push_token && Expo.isExpoPushToken(recipient.expo_push_token)) {
        const pushData = { ...payload.data }
        delete pushData.location

        messages.push({
          to: recipient.expo_push_token,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: pushData,
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
      auth_kind: auth.kind,
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
