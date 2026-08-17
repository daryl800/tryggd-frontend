// supabase/functions/send-help-request/index.ts
// Handles CALL ME NOW and ASKED TO SEND MONEY? help requests.
// Called by the React Native client with a single authenticated request.
// Server-side: authenticates user, validates type, deduplicates, creates DB
// record, finds all trusted contacts, creates in-app notifications, sends
// Expo push notifications (+ Aliyun fallback for China Android).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Expo } from 'https://esm.sh/expo-server-sdk@3.6.0'
import { sendAliyunPushByDevice } from '../_shared/aliyunPush.ts'

type HelpRequestType = 'call_me_now' | 'money_transfer_help'

const VALID_TYPES = new Set<HelpRequestType>(['call_me_now', 'money_transfer_help'])
const DEDUP_WINDOW_MS = 5000

const PUSH_MESSAGES: Record<HelpRequestType, {
  title: (name: string) => string
  body: (name: string) => string
}> = {
  call_me_now: {
    title: (name) => `✋ ${name} needs help`,
    body: () => `Please contact them right away.`,
  },
  money_transfer_help: {
    title: (name) => `🛑 Money 💸 transfer ⚠️`,
    body: (name) =>
      `${name} is being asked to send money. Please call them now before they make any payment.`,
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Missing or invalid Authorization header', 401)
    }
    const token = authHeader.replace('Bearer ', '')

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
    if (authError || !user) {
      return jsonError('Invalid or expired token', 401)
    }

    // 2. Parse and validate body
    let body: { type?: string }
    try {
      body = await req.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }

    if (!body.type || !VALID_TYPES.has(body.type as HelpRequestType)) {
      return jsonError('Invalid help request type', 400)
    }
    const helpType = body.type as HelpRequestType

    // 3. Duplicate protection — same user, same type, within 5 seconds
    const dedupeWindow = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    const { data: recent } = await serviceClient
      .from('help_requests')
      .select('id, created_at')
      .eq('user_id', user.id)
      .eq('type', helpType)
      .gte('created_at', dedupeWindow)
      .limit(1)

    if (recent && recent.length > 0) {
      console.log(`⏩ Dedup: ${helpType} already sent by ${user.id} within ${DEDUP_WINDOW_MS}ms`)
      return jsonOk({ success: true, deduplicated: true })
    }

    // 4. Get sender's display name (server-side — never trust client)
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .maybeSingle()

    const senderName =
      profile?.display_name ||
      profile?.username ||
      'A contact'

    // 5. Create help_request record
    const { data: helpRow, error: insertError } = await serviceClient
      .from('help_requests')
      .insert({
        user_id: user.id,
        type: helpType,
        status: 'sent',
        created_at: new Date().toISOString(),
      })
      .select('id, created_at')
      .single()

    if (insertError || !helpRow) {
      console.error('Failed to insert help_request:', insertError)
      return jsonError('Failed to create help request', 500)
    }

    console.log(`✅ Created help_request ${helpRow.id} type=${helpType} user=${user.id}`)

    // 6. Find contacts with help alerts enabled
    const { data: contactRows, error: contactsError } = await serviceClient
      .from('contacts')
      .select('contact_user_id')
      .eq('owner_user_id', user.id)
      .eq('help_alerts_enabled', true)

    if (contactsError) {
      console.error('Failed to fetch contacts:', contactsError)
      return jsonError('Failed to fetch contacts', 500)
    }

    const contactIds: string[] = (contactRows ?? []).map((r: any) => r.contact_user_id)

    if (contactIds.length === 0) {
      console.log('⏩ No contacts — help request created but no notifications sent')
      return jsonOk({ success: true, pushes_sent: 0, pushes_failed: 0 })
    }

    console.log(`📋 Found ${contactIds.length} contacts`)

    // 7. Get push tokens + language settings for all contacts
    const { data: tokenRows } = await serviceClient
      .from('user_push_tokens')
      .select('user_id, expo_push_token, aliyun_device_id')
      .in('user_id', contactIds)

    const { data: settingRows } = await serviceClient
      .from('user_settings')
      .select('user_id, language')
      .in('user_id', contactIds)

    const tokenMap = new Map(
      (tokenRows ?? []).map((r: any) => [r.user_id, r])
    )
    const langMap = new Map(
      (settingRows ?? []).map((r: any) => [r.user_id, r.language as string])
    )

    const pushMessages = PUSH_MESSAGES[helpType]

    // 8. Create in-app notifications + queue push messages
    const notificationsToInsert: object[] = []
    const expoMessages: object[] = []
    const aliyunMessages: { deviceId: string; title: string; body: string }[] = []

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
    const expo = new Expo({ accessToken: expoAccessToken })

    for (const contactId of contactIds) {
      const pushToken = tokenMap.get(contactId)
      const _lang = langMap.get(contactId) ?? 'en'

      const notifTitle = pushMessages.title(senderName)
      const notifBody = pushMessages.body(senderName)

      notificationsToInsert.push({
        user_id: contactId,
        type: helpType,
        title: notifTitle,
        body: notifBody,
        data: {
          type: helpType,
          senderUserId: user.id,
          senderName,
          helpRequestId: helpRow.id,
          screen: 'activity',
        },
        sender_user_id: user.id,
        read: false,
        created_at: new Date().toISOString(),
      })

      if (pushToken?.expo_push_token && Expo.isExpoPushToken(pushToken.expo_push_token)) {
        expoMessages.push({
          to: pushToken.expo_push_token,
          sound: 'default',
          title: notifTitle,
          body: notifBody,
          data: {
            type: helpType,
            senderUserId: user.id,
            senderName,
            screen: 'activity',
          },
          channelId: 'default',
          priority: 'high',
        })
      } else if (pushToken?.aliyun_device_id) {
        aliyunMessages.push({
          deviceId: pushToken.aliyun_device_id,
          title: notifTitle,
          body: notifBody,
        })
      }
    }

    // 9. Insert notifications
    if (notificationsToInsert.length > 0) {
      const { error: notifError } = await serviceClient
        .from('notifications')
        .insert(notificationsToInsert)

      if (notifError) {
        console.error('Failed to insert notifications:', notifError)
      }
    }

    // 10. Send Expo push notifications
    let pushesSent = 0
    let pushesFailed = 0

    for (const message of expoMessages) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (expoAccessToken) headers['Authorization'] = `Bearer ${expoAccessToken}`

        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers,
          body: JSON.stringify(message),
        })
        if (res.ok) {
          pushesSent++
        } else {
          pushesFailed++
          console.error('Expo push failed:', await res.json())
        }
      } catch (err) {
        pushesFailed++
        console.error('Expo push exception:', err)
      }
    }

    // 11. Aliyun fallback (China Android)
    let aliyunSent = 0
    let aliyunFailed = 0
    for (const msg of aliyunMessages) {
      const result = await sendAliyunPushByDevice(msg.deviceId, {
        title: msg.title,
        body: msg.body,
      })
      if (result.success) aliyunSent++
      else aliyunFailed++
    }

    console.log(`✅ Done. pushes_sent=${pushesSent} pushes_failed=${pushesFailed} aliyun_sent=${aliyunSent}`)

    return jsonOk({
      success: true,
      help_request_id: helpRow.id,
      created_at: helpRow.created_at,
      pushes_sent: pushesSent,
      pushes_failed: pushesFailed,
      aliyun_sent: aliyunSent,
      aliyun_failed: aliyunFailed,
    })
  } catch (error) {
    console.error('💥 FATAL:', error)
    return jsonError(
      error instanceof Error ? error.message : 'Unknown error',
      500
    )
  }
})

function jsonOk(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
