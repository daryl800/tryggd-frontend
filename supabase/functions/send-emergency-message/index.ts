import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_MESSAGE_LENGTH = 300

const EMERGENCY_MESSAGES = {
  en: { title: '🚨 Emergency message', someone: 'Someone' },
  da: { title: '🚨 Nødmeddelelse', someone: 'Nogen' },
  de: { title: '🚨 Notfallnachricht', someone: 'Jemand' },
  es: { title: '🚨 Mensaje de emergencia', someone: 'Alguien' },
  fi: { title: '🚨 Hätäviesti', someone: 'Joku' },
  fr: { title: '🚨 Message d’urgence', someone: 'Quelqu’un' },
  it: { title: '🚨 Messaggio di emergenza', someone: 'Qualcuno' },
  ja: { title: '🚨 緊急メッセージ', someone: '誰か' },
  ko: { title: '🚨 긴급 메시지', someone: '누군가' },
  no: { title: '🚨 Nødmelding', someone: 'Noen' },
  sv: { title: '🚨 Nödmeddelande', someone: 'Någon' },
  th: { title: '🚨 ข้อความฉุกเฉิน', someone: 'ใครบางคน' },
  'zh-Hans': { title: '🚨 紧急消息', someone: '有人' },
  'zh-Hant': { title: '🚨 緊急訊息', someone: '有人' },
} as const

type EmergencyLocaleKey = keyof typeof EMERGENCY_MESSAGES

type EmergencyPayload = {
  receiverUserId: string
  senderUserId: string
  senderName?: string
  message: string
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

function getEmergencyLocale(language?: string | null) {
  if (!language) return EMERGENCY_MESSAGES.en
  return EMERGENCY_MESSAGES[language as EmergencyLocaleKey] ?? EMERGENCY_MESSAGES.en
}

serve(async (req) => {
  try {
    const { user, error: authError, status } = await validateAndGetUser(req)

    if (!user) {
      return new Response(JSON.stringify({ error: authError }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { receiverUserId, senderUserId, senderName, message } = await req.json() as EmergencyPayload

    if (user.id !== senderUserId) {
      return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const trimmedMessage = (message ?? '').trim()
    if (!trimmedMessage) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return new Response(JSON.stringify({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const [{ data: entitlement }, { data: senderProfilePlan }, { data: appSettings }] = await Promise.all([
      supabase.from('user_entitlements').select('plan').eq('user_id', senderUserId).maybeSingle(),
      supabase.from('profiles').select('pilot_preview_activated_at').eq('id', senderUserId).maybeSingle(),
      supabase.from('app_settings').select('pilot_preview_enabled, pilot_preview_ends_at').eq('id', 1).maybeSingle(),
    ])

    const hasPaidPlus = entitlement?.plan === 'plus'
    const previewOpen =
      appSettings?.pilot_preview_enabled === true &&
      !!appSettings.pilot_preview_ends_at &&
      new Date(appSettings.pilot_preview_ends_at).getTime() > Date.now()
    const previewActivated = !!senderProfilePlan?.pilot_preview_activated_at
    const isPlus = hasPaidPlus || (previewOpen && previewActivated)

    if (!isPlus) {
      return new Response(JSON.stringify({ error: 'Emergency messages require Plus' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const [{ data: tokenData }, { data: senderProfile }, { data: receiverSettings }] = await Promise.all([
      supabase
        .from('user_push_tokens')
        .select('expo_push_token, contact_checkin_notifications')
        .eq('user_id', receiverUserId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', senderUserId)
        .maybeSingle(),
      supabase
        .from('user_settings')
        .select('language')
        .eq('user_id', receiverUserId)
        .maybeSingle(),
    ])

    if (!tokenData?.expo_push_token) {
      return new Response(JSON.stringify({ error: 'No push token found for recipient' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Emergency messages bypass contact_checkin_notifications — that toggle is for
    // routine check-in pings, not for a contact actively flagging an emergency.

    const locale = getEmergencyLocale(receiverSettings?.language)
    const displayName =
      senderProfile?.display_name ||
      senderProfile?.username ||
      senderName ||
      locale.someone

    const body = `${displayName}: ${trimmedMessage}`

    const notificationData = {
      type: 'emergency_message',
      senderUserId,
      senderName: displayName,
      message: trimmedMessage,
      screen: 'activity',
    }

    const { data: notification, error: insertError } = await supabase
      .from('notifications')
      .insert({
        user_id: receiverUserId,
        type: 'emergency_message',
        title: locale.title,
        body,
        data: notificationData,
        sender_user_id: senderUserId,
        read: false,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: tokenData.expo_push_token,
        sound: 'default',
        title: locale.title,
        body,
        data: { ...notificationData, notificationId: notification?.id },
        channelId: 'default',
        priority: 'high',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Expo push failed', result }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown emergency message error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
