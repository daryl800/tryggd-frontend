// supabase/functions/send-checkin-notifications/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Expo } from 'https://esm.sh/expo-server-sdk@3.6.0'

interface CheckinPayload {
  user_id: string
  checkin_time: string
  timezone: string
}

type WellnessBucket =
  | 'very_low'
  | 'low'
  | 'neutral'
  | 'good'
  | 'great'

type SharedLocation = {
  latitude: number
  longitude: number
  accuracyMeters: number | null
}

type UserPlan = 'free' | 'plus'
type HomeStyle = 'simple' | 'enhanced'

type AuthorizedRequest =
  | { kind: 'user'; userId: string }
  | { kind: 'internal' }

type NotificationPayload = {
  title: string
  body: string
  type: string
  data: Record<string, any>
}


const CHECKIN_MESSAGES = {
  en: {
    title: (name: string) => `${name} checked in.`,
    fallback: (time: string) => `All is well! - ${time}`,
    very_low: () => `😔 Not feeling well today`,
    low: () => `😕 A little low today`,
    neutral: () => `🙂 All is well`,
    good: () => `☺️ Feeling good today`,
    great: () => `😊 Feeling very happy today`,
  },
  da: {
    title: (name: string) => `${name} har tjekket ind.`,
    fallback: (time: string) => `Alt er godt! - ${time}`,
    very_low: () => `😔 Har det ikke så godt i dag`,
    low: () => `😕 Er lidt nede i dag`,
    neutral: () => `🙂 Alt er godt`,
    good: () => `☺️ Har det godt i dag`,
    great: () => `😊 Føler sig meget glad i dag`,
  },
  de: {
    title: (name: string) => `${name} hat eingecheckt.`,
    fallback: (time: string) => `Alles ist gut! - ${time}`,
    very_low: () => `😔 Fühlt sich heute nicht gut`,
    low: () => `😕 Ist heute etwas niedergeschlagen`,
    neutral: () => `🙂 Alles ist gut`,
    good: () => `☺️ Fühlt sich heute gut`,
    great: () => `😊 Ist heute sehr glücklich`,
  },
  es: {
    title: (name: string) => `${name} ha hecho check-in.`,
    fallback: (time: string) => `¡Todo está bien! - ${time}`,
    very_low: () => `😔 No se siente bien hoy`,
    low: () => `😕 Se siente un poco decaído hoy`,
    neutral: () => `🙂 Todo está bien`,
    good: () => `☺️ Se siente bien hoy`,
    great: () => `😊 Se siente muy feliz hoy`,
  },
  fi: {
    title: (name: string) => `${name} on kirjautunut.`,
    fallback: (time: string) => `Kaikki on hyvin! - ${time}`,
    very_low: () => `😔 Olo ei ole tänään hyvä`,
    low: () => `😕 Olo on tänään hieman alakuloinen`,
    neutral: () => `🙂 Kaikki on hyvin`,
    good: () => `☺️ Olo on hyvä tänään`,
    great: () => `😊 On tänään todella iloinen`,
  },
  fr: {
    title: (name: string) => `${name} a pointé.`,
    fallback: (time: string) => `Tout va bien ! - ${time}`,
    very_low: () => `😔 Ne se sent pas bien aujourd’hui`,
    low: () => `😕 Se sent un peu triste aujourd’hui`,
    neutral: () => `🙂 Tout va bien`,
    good: () => `☺️ Se sent bien aujourd’hui`,
    great: () => `😊 Se sent très heureux aujourd’hui`,
  },
  it: {
    title: (name: string) => `${name} ha fatto il check-in.`,
    fallback: (time: string) => `Va tutto bene! - ${time}`,
    very_low: () => `😔 Oggi non si sente bene`,
    low: () => `😕 Oggi si sente un po' giù`,
    neutral: () => `🙂 Va tutto bene`,
    good: () => `☺️ Oggi si sente bene`,
    great: () => `😊 Si sente molto felice oggi`,
  },
  ja: {
    title: (name: string) => `${name}さんがチェックインしました。`,
    fallback: (time: string) => `すべて順調です！ - ${time}`,
    very_low: () => `😔 今日はかなりつらそうです`,
    low: () => `😕 今日は少し落ち込んでいます`,
    neutral: () => `🙂 すべて順調です`,
    good: () => `☺️ 今日は気分が良さそうです`,
    great: () => `😊 今日はとても嬉しい気分です`,
  },
  ko: {
    title: (name: string) => `${name}님이 체크인했어요.`,
    fallback: (time: string) => `모든 것이 괜찮아요! - ${time}`,
    very_low: () => `😔 오늘은 몸 상태가 좋지 않아요`,
    low: () => `😕 오늘은 조금 우울해요`,
    neutral: () => `🙂 모든 것이 괜찮아요`,
    good: () => `☺️ 오늘은 기분이 좋아요`,
    great: () => `😊 오늘은 정말 행복해요`,
  },
  no: {
    title: (name: string) => `${name} har sjekket inn.`,
    fallback: (time: string) => `Alt er bra! - ${time}`,
    very_low: () => `😔 Føler seg ikke bra i dag`,
    low: () => `😕 Er litt nedfor i dag`,
    neutral: () => `🙂 Alt er bra`,
    good: () => `☺️ Føler seg bra i dag`,
    great: () => `😊 Er veldig glad i dag`,
  },
  sv: {
    title: (name: string) => `${name} har checkat in.`,
    fallback: (time: string) => `Allt är väl! - ${time}`,
    very_low: () => `😔 Mår inte bra idag`,
    low: () => `😕 Känner sig lite låg idag`,
    neutral: () => `🙂 Allt är väl`,
    good: () => `☺️ Känner sig bra idag`,
    great: () => `😊 Känner sig väldigt glad idag`,
  },
  'zh-Hans': {
    title: (name: string) => `${name} 签到`,
    fallback: (time: string) => `一切安好！- ${time}`,
    very_low: () => `😔 太不舒服`,
    low: () => `😕 有点低落`,
    neutral: () => `🙂 一切安好`,
    good: () => `☺️ 感觉不错`,
    great: () => `😊 今天很开心`,
  },
  'zh-Hant': {
    title: (name: string) => `${name} 簽到`,
    fallback: (time: string) => `一切安好！- ${time}`,
    very_low: () => `😔 太不舒服`,
    low: () => `😕 有點低落`,
    neutral: () => `🙂 一切安好`,
    good: () => `☺️ 感覺不錯`,
    great: () => `😊 今天很開心`,
  },
} as const

const TRIP_STATUS_LABELS: Record<string, Record<string, string>> = {
  en:       { leaving: '🧳 Leaving for the trip', boarding: '🛫 Boarding / departing soon', layover: '🛑 Layover / connecting', landed: '🛬 Landed safely', on_the_move: '🚕 On the move', at_hotel: '🏨 Arrived at hotel', on_trip: '🗺️ On the trip', heading_home: '🏠 Heading home', trip_ended: '✅ Trip ended — home safely' },
  da:       { leaving: '🧳 Afsted på rejsen', boarding: '🛫 Boarding / afgang snart', layover: '🛑 Mellemlanding / forbindelse', landed: '🛬 Landet sikkert', on_the_move: '🚕 På farten', at_hotel: '🏨 Ankommet til hotellet', on_trip: '🗺️ På rejsen', heading_home: '🏠 På vej hjem', trip_ended: '✅ Rejsen slut — hjemme sikkert' },
  de:       { leaving: '🧳 Auf zur Reise', boarding: '🛫 Boarding / Abflug bald', layover: '🛑 Zwischenstopp / Umstieg', landed: '🛬 Sicher gelandet', on_the_move: '🚕 Unterwegs', at_hotel: '🏨 Im Hotel angekommen', on_trip: '🗺️ Auf der Reise', heading_home: '🏠 Auf dem Heimweg', trip_ended: '✅ Reise beendet — sicher zu Hause' },
  es:       { leaving: '🧳 Saliendo de viaje', boarding: '🛫 Embarcando / saliendo pronto', layover: '🛑 Escala / conexión', landed: '🛬 Aterrizando con seguridad', on_the_move: '🚕 En movimiento', at_hotel: '🏨 Llegué al hotel', on_trip: '🗺️ De viaje', heading_home: '🏠 Camino a casa', trip_ended: '✅ Viaje terminado — en casa sano/a' },
  fi:       { leaving: '🧳 Lähden matkalle', boarding: '🛫 Boarding / lähtö pian', layover: '🛑 Välilaskeutuminen / vaihto', landed: '🛬 Laskeutunut turvallisesti', on_the_move: '🚕 Liikkeellä', at_hotel: '🏨 Saapunut hotelliin', on_trip: '🗺️ Matkalla', heading_home: '🏠 Matkalla kotiin', trip_ended: '✅ Matka päättyi — kotona turvassa' },
  fr:       { leaving: '🧳 Je pars en voyage', boarding: '🛫 Embarquement / départ imminent', layover: '🛑 Escale / correspondance', landed: '🛬 Atterri en sécurité', on_the_move: '🚕 En déplacement', at_hotel: "🏨 Arrivé à l'hôtel", on_trip: '🗺️ En voyage', heading_home: '🏠 En route pour la maison', trip_ended: '✅ Voyage terminé — rentré sain et sauf' },
  it:       { leaving: '🧳 Parto per il viaggio', boarding: '🛫 Imbarco / partenza imminente', layover: '🛑 Scalo / coincidenza', landed: '🛬 Atterrato in sicurezza', on_the_move: '🚕 In movimento', at_hotel: '🏨 Arrivato in hotel', on_trip: '🗺️ In viaggio', heading_home: '🏠 Tornando a casa', trip_ended: '✅ Viaggio concluso — a casa sano/a' },
  ja:       { leaving: '🧳 旅立ちます', boarding: '🛫 搭乗・出発間近', layover: '🛑 乗り継ぎ中', landed: '🛬 無事着陸', on_the_move: '🚕 移動中', at_hotel: '🏨 ホテルに到着', on_trip: '🗺️ 旅行中', heading_home: '🏠 帰宅中', trip_ended: '✅ 旅行終了・無事帰宅' },
  ko:       { leaving: '🧳 여행 출발', boarding: '🛫 탑승 / 곧 출발', layover: '🛑 경유 / 환승 중', landed: '🛬 안전하게 착륙', on_the_move: '🚕 이동 중', at_hotel: '🏨 호텔 도착', on_trip: '🗺️ 여행 중', heading_home: '🏠 집으로 향하는 중', trip_ended: '✅ 여행 종료 — 안전하게 귀가' },
  no:       { leaving: '🧳 Drar på tur', boarding: '🛫 Ombordstigning / avgang snart', layover: '🛑 Mellomlanding / tilkobling', landed: '🛬 Landet trygt', on_the_move: '🚕 På farten', at_hotel: '🏨 Ankommet hotellet', on_trip: '🗺️ På reisen', heading_home: '🏠 På vei hjem', trip_ended: '✅ Turen er over — trygt hjemme' },
  sv:       { leaving: '🧳 Ger mig iväg', boarding: '🛫 Ombordstigning / avresa snart', layover: '🛑 Mellanlandning / byte', landed: '🛬 Landat säkert', on_the_move: '🚕 På väg', at_hotel: '🏨 Framme på hotellet', on_trip: '🗺️ På resan', heading_home: '🏠 På väg hem', trip_ended: '✅ Resan slut — hemma säkert' },
  th:       { leaving: '🧳 ออกเดินทางแล้ว', boarding: '🛫 กำลังขึ้นเครื่อง / ใกล้ออกเดินทาง', layover: '🛑 แวะพัก / ต่อเที่ยวบิน', landed: '🛬 ลงจอดปลอดภัย', on_the_move: '🚕 กำลังเดินทาง', at_hotel: '🏨 ถึงโรงแรมแล้ว', on_trip: '🗺️ อยู่ระหว่างการเดินทาง', heading_home: '🏠 กำลังกลับบ้าน', trip_ended: '✅ ทริปสิ้นสุด — กลับบ้านปลอดภัย' },
  'zh-Hans': { leaving: '🧳 出发了', boarding: '🛫 登机／准备起飞', layover: '🛑 中途停留/转机', landed: '🛬 已安全着陆', on_the_move: '🚕 在移动中', at_hotel: '🏨 已抵达酒店', on_trip: '🗺️ 旅程中', heading_home: '🏠 正在回家途中', trip_ended: '✅ 旅程结束——已安全到家' },
  'zh-Hant': { leaving: '🧳 出發了', boarding: '🛫 登機／準備起飛', layover: '🛑 中途停留／轉機', landed: '🛬 已安全著陸', on_the_move: '🚕 在移動中', at_hotel: '🏨 已抵達酒店', on_trip: '🗺️ 旅程中', heading_home: '🏠 正在回家途中', trip_ended: '✅ 旅程結束——已安全到家' },
}

function getTripStatusLabel(status: string, lang: string): string {
  const langMap = TRIP_STATUS_LABELS[lang] ?? TRIP_STATUS_LABELS.en
  return langMap[status] ?? TRIP_STATUS_LABELS.en[status] ?? status
}

const HOME_PRESENCE_LABELS: Record<string, Record<string, string>> = {
  en:       { home: '🏠 At home', outside: '🚶 Outside', busy: '💼 Busy', relaxing: '☕ Relaxing' },
  da:       { home: '🏠 Hjemme', outside: '🚶 Ude', busy: '💼 Optaget', relaxing: '☕ Slapper af' },
  de:       { home: '🏠 Zuhause', outside: '🚶 Unterwegs', busy: '💼 Beschäftigt', relaxing: '☕ Entspanne mich' },
  es:       { home: '🏠 En casa', outside: '🚶 Fuera', busy: '💼 Ocupado', relaxing: '☕ Relajándome' },
  fi:       { home: '🏠 Kotona', outside: '🚶 Ulkona', busy: '💼 Kiireinen', relaxing: '☕ Rentoutumassa' },
  fr:       { home: '🏠 À la maison', outside: "🚶 Sorti(e)", busy: '💼 Occupé(e)', relaxing: '☕ Je me détends' },
  it:       { home: '🏠 A casa', outside: '🚶 Fuori', busy: '💼 Occupato', relaxing: '☕ Mi rilasso' },
  ja:       { home: '🏠 在宅', outside: '🚶 外出中', busy: '💼 忙しい', relaxing: '☕ くつろぎ中' },
  ko:       { home: '🏠 집에 있음', outside: '🚶 외출 중', busy: '💼 바쁨', relaxing: '☕ 휴식 중' },
  no:       { home: '🏠 Hjemme', outside: '🚶 Ute', busy: '💼 Opptatt', relaxing: '☕ Slapper av' },
  sv:       { home: '🏠 Hemma', outside: '🚶 Ute', busy: '💼 Upptagen', relaxing: '☕ Kopplar av' },
  th:       { home: '🏠 อยู่ที่บ้าน', outside: '🚶 ออกไปข้างนอก', busy: '💼 ไม่ว่าง', relaxing: '☕ พักผ่อน' },
  'zh-Hans': { home: '🏠 在家', outside: '🚶 外出中', busy: '💼 忙碌中', relaxing: '☕ 放松中' },
  'zh-Hant': { home: '🏠 在家', outside: '🚶 外出中', busy: '💼 忙碌中', relaxing: '☕ 放鬆中' },
}

function getHomePresenceLabel(status: string, lang: string): string {
  const langMap = HOME_PRESENCE_LABELS[lang] ?? HOME_PRESENCE_LABELS.en
  return langMap[status] ?? HOME_PRESENCE_LABELS.en[status] ?? status
}

type CheckinLocaleKey = keyof typeof CHECKIN_MESSAGES

function getCheckinLocale(language?: string | null) {
  if (!language) return CHECKIN_MESSAGES.en
  return CHECKIN_MESSAGES[language as CheckinLocaleKey] ?? CHECKIN_MESSAGES.en
}

function getWellnessBucket(score: number): WellnessBucket {
  if (score <= -2) return 'very_low'
  if (score === -1) return 'low'
  if (score === 0) return 'neutral'
  if (score === 1) return 'good'
  return 'great'
}

function getWellnessBody(
  locale: typeof CHECKIN_MESSAGES.en,
  contactDisplayName: string,
  score: number
): string {
  const bucket = getWellnessBucket(score)
  return locale[bucket](contactDisplayName)
}

function getInternalTriggerKey() {
  return (
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    null
  )
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
    console.error('Failed to load user entitlements, defaulting to free:', error.message)
    return 'free'
  }

  return data?.plan === 'plus' ? 'plus' : 'free'
}

async function getUserHomeStyle(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<HomeStyle> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('home_style')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load user home style, defaulting to simple:', error.message)
    return 'simple'
  }

  return data?.home_style === 'enhanced' ? 'enhanced' : 'simple'
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
  locale: typeof CHECKIN_MESSAGES.en,
  contactDisplayName: string,
  formattedTime: string,
  user_id: string,
  owner_user_id: string,
  checkin_time: string,
  timezone: string,
  location: SharedLocation | null,
  wellnessScore: number | null,
  tripStatus: string | null,
  homePresence: string | null,
  recipientLang: string
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

  if (wellnessScore !== null) {
    data.wellnessScore = wellnessScore
  }

  if (tripStatus) {
    data.tripStatus = tripStatus
  }

  if (homePresence) {
    data.homePresence = homePresence
  }

  let body: string
  if (tripStatus) {
    body = `${getTripStatusLabel(tripStatus, recipientLang)} · ${formattedTime}`
  } else if (homePresence) {
    body = `${getHomePresenceLabel(homePresence, recipientLang)} · ${formattedTime}`
  } else if (wellnessScore !== null) {
    body = `${getWellnessBody(locale, contactDisplayName, wellnessScore)} · ${formattedTime}`
  } else {
    body = locale.fallback(formattedTime)
  }

  const locationPrefix = location ? '📍 ' : ''

  return {
    title: `${locationPrefix}${locale.title(contactDisplayName)}`,
    body,
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

    const senderPlan = await getUserPlan(supabase, user_id)
    const isPlusSender = senderPlan === 'plus'
    const senderHomeStyle = await getUserHomeStyle(supabase, user_id)
    const canSendWellness = isPlusSender
    const canSendEnhancedStatus = isPlusSender && senderHomeStyle === 'enhanced'
    console.log('💳 Sender plan/style:', { senderPlan, senderHomeStyle })

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
      .select('contact_user_id, checkin_notifications_enabled, location_sharing_enabled')
      .eq('owner_user_id', user_id)

    const eligibleContacts =
      isPlusSender
        ? (contactRelationships || []).filter(
            (relationship: any) => relationship.checkin_notifications_enabled !== false
          )
        : (contactRelationships || [])

    if (contactsError) throw contactsError

    if (!eligibleContacts.length) {
      console.log('⏩ No eligible contacts selected by sender')
      return new Response(JSON.stringify({ message: 'No eligible contacts selected by sender' }), { status: 200 })
    }

    console.log(`✅ Found ${eligibleContacts.length} contacts`)
    console.log('📋 Eligible contact relationships:', eligibleContacts)

    const { data: latestCheckinRow, error: latestCheckinError } = await supabase
      .from('checkins')
      .select('location_latitude, location_longitude, location_accuracy_meters, checked_in_at_utc, wellness_score')
      .eq('user_id', user_id)
      .order('checked_in_at_utc', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestCheckinError) {
      throw latestCheckinError
    }

    // Fetch trip_status / home_presence from users_latest_checkin (nullable — null means not set)
    const { data: latestCheckinMeta } = await supabase
      .from('users_latest_checkin')
      .select('trip_status, home_presence')
      .eq('user_id', user_id)
      .maybeSingle()

    const tripStatus: string | null = canSendEnhancedStatus
      ? latestCheckinMeta?.trip_status ?? null
      : null

    const homePresence: string | null = canSendEnhancedStatus && !tripStatus
      ? latestCheckinMeta?.home_presence ?? null
      : null

    const sharedLocation: SharedLocation | null =
      isPlusSender &&
      latestCheckinRow?.location_latitude != null &&
      latestCheckinRow?.location_longitude != null
        ? {
            latitude: latestCheckinRow.location_latitude,
            longitude: latestCheckinRow.location_longitude,
            accuracyMeters: latestCheckinRow.location_accuracy_meters ?? null,
          }
        : null

    const locationRecipientIds = new Set(
      eligibleContacts
        .filter((relationship) => relationship.location_sharing_enabled === true)
        .map((relationship) => relationship.contact_user_id)
    )

    const wellnessScore =
      canSendWellness && typeof latestCheckinRow?.wellness_score === 'number'
        ? latestCheckinRow.wellness_score
        : null

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
    const recipientIds = eligibleContacts.map(rel => rel.contact_user_id)
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
    const formattedTime = new Date(checkin_time).toLocaleTimeString('en-GB', {
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

    const { data: recipientSettings } = await supabase
      .from('user_settings')
      .select('user_id, language')
      .in('user_id', recipientIds)

    const recipientLanguageMap = new Map(
      (recipientSettings || []).map((row) => [row.user_id, row.language])
    )

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')

    for (const recipient of recipients) {
      if (alreadyNotifiedUserIds.has(recipient.user_id)) {
        console.log(`⏩ Skipping duplicate notification for ${recipient.user_id}`)
        continue
      }

      const recipientLang = recipientLanguageMap.get(recipient.user_id) ?? 'en'
      const locale = getCheckinLocale(recipientLang)

      const payload = buildContactCheckinNotification(
        locale,
        checkingUserName,
        formattedTime,
        user_id,
        recipient.user_id,
        checkin_time,
        timezone,
        sharedLocation && locationRecipientIds.has(recipient.user_id)
          ? sharedLocation
          : null,
        wellnessScore,
        tripStatus,
        homePresence,
        recipientLang
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
