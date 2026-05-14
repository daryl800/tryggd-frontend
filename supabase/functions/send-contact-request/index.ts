import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONTACT_REQUEST_MESSAGES = {
  en: { title: '📩 Contact Request', body: (name: string) => `${name} wants to add you as a contact` },
  da: { title: '📩 Kontaktanmodning', body: (name: string) => `${name} vil gerne tilføje dig som kontakt` },
  de: { title: '📩 Kontaktanfrage', body: (name: string) => `${name} möchte dich als Kontakt hinzufügen` },
  es: { title: '📩 Solicitud de contacto', body: (name: string) => `${name} quiere añadirte como contacto` },
  fi: { title: '📩 Yhteyspyyntö', body: (name: string) => `${name} haluaa lisätä sinut yhteystiedoksi` },
  fr: { title: '📩 Demande de contact', body: (name: string) => `${name} souhaite vous ajouter comme contact` },
  it: { title: '📩 Richiesta di contatto', body: (name: string) => `${name} vuole aggiungerti come contatto` },
  ja: { title: '📩 連絡先リクエスト', body: (name: string) => `${name}さんがあなたを連絡先に追加したがっています` },
  ko: { title: '📩 연락처 요청', body: (name: string) => `${name}님이 회원님을 연락처로 추가하려고 합니다` },
  no: { title: '📩 Kontaktforespørsel', body: (name: string) => `${name} vil legge deg til som kontakt` },
  sv: { title: '📩 Kontaktförfrågan', body: (name: string) => `${name} vill lägga till dig som kontakt` },
  'zh-Hans': { title: '📩 联系人请求', body: (name: string) => `${name} 想将你添加为联系人` },
  'zh-Hant': { title: '📩 聯絡人請求', body: (name: string) => `${name} 想將你新增為聯絡人` },
} as const

type ContactRequestLocaleKey = keyof typeof CONTACT_REQUEST_MESSAGES

type ContactRequestPayload = {
  receiverUserId: string
  senderUserId: string
  senderName: string
  senderEmail: string
  requestId: string
}

function getContactRequestLocale(language?: string | null) {
  if (!language) return CONTACT_REQUEST_MESSAGES.en
  return CONTACT_REQUEST_MESSAGES[language as ContactRequestLocaleKey] ?? CONTACT_REQUEST_MESSAGES.en
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

serve(async (req) => {
  try {
    const { user, error: authError, status } = await validateAndGetUser(req)

    if (!user) {
      return new Response(JSON.stringify({ error: authError }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const {
      receiverUserId,
      senderUserId,
      senderName,
      senderEmail,
      requestId,
    } = await req.json() as ContactRequestPayload

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
      .eq('type', 'contact_request')
      .filter('data->>requestId', 'eq', requestId)
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
        .select('display_name, avatar_url, username')
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

    const displayName =
      senderProfile?.display_name ||
      senderProfile?.username ||
      senderName ||
      senderEmail.split('@')[0]
    const locale = getContactRequestLocale(receiverSettings?.language)

    const notificationData = {
      type: 'contact_request',
      requestId,
      senderUserId,
      senderName: displayName,
      senderEmail,
      senderAvatar: senderProfile?.avatar_url ?? null,
      screen: 'contacts',
      tab: 'requests',
    }

    const { error: dbError } = await supabase
      .from('notifications')
      .insert({
        user_id: receiverUserId,
        type: 'contact_request',
        title: locale.title,
        body: locale.body(displayName),
        data: notificationData,
        sender_user_id: senderUserId,
        read: false,
        created_at: new Date().toISOString(),
      })

    if (dbError) {
      console.error('Failed to insert contact request notification', dbError)
    }

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

    if (result.data && Array.isArray(result.data)) {
      for (const receipt of result.data) {
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          await supabase
            .from('user_push_tokens')
            .update({
              expo_push_token: null,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', receiverUserId)

          return new Response(JSON.stringify({ error: 'Device not registered' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    }

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown contact request error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
