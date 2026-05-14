import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WELFARE_MESSAGES = {
  en: { title: '💛 Just checking in', body: (name: string) => `${name}: Hi, are you alright?`, someone: 'Someone' },
  da: { title: '💛 Har du det godt?', body: (name: string) => `${name}: Hej, har du det godt?`, someone: 'Nogen' },
  de: { title: '💛 Geht es dir gut?', body: (name: string) => `${name}: Hallo, geht es dir gut?`, someone: 'Jemand' },
  es: { title: '💛 ¿Estás bien?', body: (name: string) => `${name}: Hola, ¿estás bien?`, someone: 'Alguien' },
  fi: { title: '💛 Oletko kunnossa?', body: (name: string) => `${name}: Hei, oletko kunnossa?`, someone: 'Joku' },
  fr: { title: '💛 Ça va ?', body: (name: string) => `${name} : Bonjour, ça va ?`, someone: 'Quelqu’un' },
  it: { title: '💛 Stai bene?', body: (name: string) => `${name}: Ciao, stai bene?`, someone: 'Qualcuno' },
  ja: { title: '💛 大丈夫ですか？', body: (name: string) => `${name}さん: こんにちは、お元気ですか？`, someone: '誰か' },
  ko: { title: '💛 괜찮으세요?', body: (name: string) => `${name}님: 안녕하세요, 괜찮으세요?`, someone: '누군가' },
  no: { title: '💛 Går det bra?', body: (name: string) => `${name}: Hei, går det bra?`, someone: 'Noen' },
  sv: { title: '💛 Är du okej?', body: (name: string) => `${name}: Hej, hur mår du?`, someone: 'Någon' },
  'zh-Hans': { title: '💛 你还好吗？', body: (name: string) => `${name}：你好，你还好吗？`, someone: '有人' },
  'zh-Hant': { title: '💛 你還好嗎？', body: (name: string) => `${name}：你好，你還好嗎？`, someone: '有人' },
} as const

type WelfareLocaleKey = keyof typeof WELFARE_MESSAGES

type WelfarePayload = {
  receiverUserId: string
  senderUserId: string
  senderName?: string
  checkinTime: string
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

function getWelfareLocale(language?: string | null) {
  if (!language) return WELFARE_MESSAGES.en
  return WELFARE_MESSAGES[language as WelfareLocaleKey] ?? WELFARE_MESSAGES.en
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

    const { receiverUserId, senderUserId, senderName, checkinTime } = await req.json() as WelfarePayload

    if (user.id !== senderUserId) {
      return new Response(JSON.stringify({ error: 'User ID mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', receiverUserId)
      .eq('sender_user_id', senderUserId)
      .eq('type', 'welfare_check')
      .filter('data->>checkinTime', 'eq', checkinTime)
      .limit(1)

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, alreadySent: true }), {
        status: 200,
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

    if (tokenData.contact_checkin_notifications === false) {
      return new Response(JSON.stringify({ error: 'Recipient has disabled contact notifications' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const locale = getWelfareLocale(receiverSettings?.language)
    const displayName =
      senderProfile?.display_name ||
      senderProfile?.username ||
      senderName ||
      locale.someone

    const notificationData = {
      type: 'welfare_check',
      senderUserId,
      senderName: displayName,
      checkinTime,
      screen: 'activity',
    }

    await supabase
      .from('notifications')
      .insert({
        user_id: receiverUserId,
        type: 'welfare_check',
        title: locale.title,
        body: locale.body(displayName),
        data: notificationData,
        sender_user_id: senderUserId,
        read: false,
        created_at: new Date().toISOString(),
      })

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
        body: locale.body(displayName),
        data: notificationData,
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
      error: error instanceof Error ? error.message : 'Unknown welfare check error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
