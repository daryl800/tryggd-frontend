// supabase/functions/send-checkin-response/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestBody {
  recipientUserId: string;
  senderUserId: string;
  checkinTime: string;
  responseKind?: 'like' | 'support';
}

interface LangMessages {
  title: string;
  body: (name: string) => string;
  someone: string;
}

const LIKE_MESSAGES: Record<string, LangMessages> = {
  en:       { title: '👍 You got a Like.',              body: (n) => `${n} sent you a like 👍`,              someone: 'Someone' },
  da:       { title: '👍 Du fik et Like.',               body: (n) => `${n} sendte dig et like 👍`,           someone: 'Nogen' },
  fi:       { title: '👍 Sait Tykkäyksen.',              body: (n) => `${n} lähetti sinulle tykkäyksen 👍`,   someone: 'Joku' },
  no:       { title: '👍 Du fikk en Like.',              body: (n) => `${n} sendte deg et like 👍`,           someone: 'Noen' },
  sv:       { title: '👍 Du fick en Like.',              body: (n) => `${n} skickade dig ett like 👍`,        someone: 'Någon' },
  ja:       { title: '👍 いいねが届きました。',           body: (n) => `${n} さんがいいねを送りました 👍`,      someone: '誰か' },
  ko:       { title: '👍 좋아요를 받았습니다.',           body: (n) => `${n}님이 좋아요를 보냈어요 👍`,         someone: '누군가' },
  fr:       { title: '👍 Vous avez reçu un Like.',       body: (n) => `${n} vous a envoyé un like 👍`,        someone: 'Quelqu\'un' },
  de:       { title: '👍 Du hast ein Like bekommen.',    body: (n) => `${n} hat dir ein Like geschickt 👍`,   someone: 'Jemand' },
  it:       { title: '👍 Hai ricevuto un Like.',         body: (n) => `${n} ti ha inviato un like 👍`,        someone: 'Qualcuno' },
  es:       { title: '👍 Has recibido un Like.',         body: (n) => `${n} te envió un like 👍`,             someone: 'Alguien' },
  'zh-Hans':{ title: '👍 你收到一个赞。',                 body: (n) => `${n} 给你发送了一个赞 👍`,              someone: '有人' },
  'zh-Hant':{ title: '👍 你收到一個讚。',                 body: (n) => `${n} 給你發送了一個讚 👍`,              someone: '有人' },
  th:       { title: '👍 คุณได้รับไลก์',                 body: (n) => `${n} ส่งไลก์ให้คุณ 👍`,               someone: 'ใครบางคน' },
}

const SUPPORT_MESSAGES: Record<string, LangMessages> = {
  en:       { title: '💪 Someone is thinking of you.',       body: (n) => `${n} sent you support 💪`,              someone: 'Someone' },
  da:       { title: '💪 Nogen tænker på dig.',              body: (n) => `${n} sender dig støtte 💪`,             someone: 'Nogen' },
  fi:       { title: '💪 Joku ajattelee sinua.',             body: (n) => `${n} lähetti sinulle tukensa 💪`,       someone: 'Joku' },
  no:       { title: '💪 Noen tenker på deg.',               body: (n) => `${n} sender deg støtte 💪`,             someone: 'Noen' },
  sv:       { title: '💪 Någon tänker på dig.',              body: (n) => `${n} skickar dig stöd 💪`,              someone: 'Någon' },
  ja:       { title: '💪 誰かがあなたのことを思っています。', body: (n) => `${n} さんがサポートを送りました 💪`,    someone: '誰か' },
  ko:       { title: '💪 누군가 당신을 생각하고 있어요.',     body: (n) => `${n}님이 당신을 응원해요 💪`,           someone: '누군가' },
  fr:       { title: '💪 Quelqu\'un pense à vous.',          body: (n) => `${n} vous envoie son soutien 💪`,       someone: 'Quelqu\'un' },
  de:       { title: '💪 Jemand denkt an dich.',             body: (n) => `${n} schickt dir Unterstützung 💪`,     someone: 'Jemand' },
  it:       { title: '💪 Qualcuno sta pensando a te.',       body: (n) => `${n} ti manda supporto 💪`,             someone: 'Qualcuno' },
  es:       { title: '💪 Alguien está pensando en ti.',      body: (n) => `${n} te envió su apoyo 💪`,             someone: 'Alguien' },
  'zh-Hans':{ title: '💪 有人在想你。',                       body: (n) => `${n} 给你发送了支持 💪`,                someone: '有人' },
  'zh-Hant':{ title: '💪 有人在想著你。',                     body: (n) => `${n} 給你發送了支持 💪`,                someone: '有人' },
  th:       { title: '💪 มีคนคิดถึงคุณอยู่',                body: (n) => `${n} ส่งกำลังใจให้คุณ 💪`,             someone: 'ใครบางคน' },
}

const DEFAULT_LANG = 'en'

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

function getMessages(responseKind: 'like' | 'support', lang: string): LangMessages {
  const table = responseKind === 'support' ? SUPPORT_MESSAGES : LIKE_MESSAGES
  return table[lang] ?? table[DEFAULT_LANG]
}

function formatLocalTime(checkinTime: string, timezone: string): string {
  return new Date(checkinTime).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone
  })
}

serve(async (req) => {
  try {
    const TEST_MODE = true

    const { user, error: authError, status } = await validateAndGetUser(req)
    if (!user) {
      return new Response(JSON.stringify({ error: authError }), { status, headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { recipientUserId, senderUserId, checkinTime, responseKind = 'like' } = await req.json() as RequestBody

    if (senderUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'Sender ID mismatch' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: senderProfile } = await supabase.from('profiles').select('display_name').eq('id', senderUserId).single()
    const senderName = senderProfile?.display_name || 'Someone'

    const { data: pushTokenData } = await supabase.from('user_push_tokens').select('expo_push_token, contact_checkin_notifications').eq('user_id', recipientUserId).maybeSingle()

    const { data: checkinData } = await supabase.from('users_latest_checkin').select('checkin_timezone').eq('user_id', recipientUserId).maybeSingle()
    const { data: recipientSettings } = await supabase.from('user_settings').select('timezone, language').eq('user_id', recipientUserId).maybeSingle()

    const recipientLanguage = recipientSettings?.language || DEFAULT_LANG
    const timezone = checkinData?.checkin_timezone || recipientSettings?.timezone || 'Europe/Stockholm'
    const formattedTime = formatLocalTime(checkinTime, timezone)

    if (!TEST_MODE) {
      const { data: existing } = await supabase.from('notifications').select('id').eq('user_id', recipientUserId).eq('sender_user_id', senderUserId).eq('type', 'checkin_response').filter('data->>checkinTime', 'eq', checkinTime).filter('data->>responseKind', 'eq', responseKind).maybeSingle()
      if (existing) {
        return new Response(JSON.stringify({ success: true, notificationId: existing.id }), { status: 200 })
      }
    }

    const messages = getMessages(responseKind, recipientLanguage)
    const title = messages.title
    const body = messages.body(senderName)

    const { data: notification, error: insertError } = await supabase.from('notifications').insert({
      user_id: recipientUserId,
      type: 'checkin_response',
      title,
      body,
      data: { senderName, senderUserId, checkinTime, checkinTimeLocal: formattedTime, respondedAt: new Date().toISOString(), timezone, language: recipientLanguage, responseKind },
      sender_user_id: senderUserId,
      read: false,
      delivery_method: 'push',
    }).select().single()

    if (insertError) throw insertError

    if (pushTokenData?.expo_push_token && pushTokenData?.contact_checkin_notifications !== false) {
      try {
        const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        if (expoAccessToken) headers['Authorization'] = `Bearer ${expoAccessToken}`
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers,
          body: JSON.stringify({ to: pushTokenData.expo_push_token, sound: 'default', title, body, data: { type: 'checkin_response', notificationId: notification.id, senderUserId, senderName, checkinTime, timezone, language: recipientLanguage, responseKind } })
        })
      } catch (pushError) {
        console.error('❌ Push failed:', pushError)
      }
    }

    return new Response(JSON.stringify({ success: true, notificationId: notification.id, timezone, language: recipientLanguage }), { status: 200 })

  } catch (error) {
    console.error('💥 Fatal error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
