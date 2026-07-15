// supabase/functions/send-checkin-notifications/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Expo } from 'https://esm.sh/expo-server-sdk@3.6.0'
import { sendAliyunPushByDevice } from '../_shared/aliyunPush.ts'

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
    title: (name: string) => `${name} tjekket ind.`,
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
    title: (name: string) => `${name} kirjautui.`,
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
    title: (name: string) => `${name} sjekket inn.`,
    fallback: (time: string) => `Alt er bra! - ${time}`,
    very_low: () => `😔 Føler seg ikke bra i dag`,
    low: () => `😕 Er litt nedfor i dag`,
    neutral: () => `🙂 Alt er bra`,
    good: () => `☺️ Føler seg bra i dag`,
    great: () => `😊 Er veldig glad i dag`,
  },
  sv: {
    title: (name: string) => `${name} checkade in.`,
    fallback: (time: string) => `Allt är väl! - ${time}`,
    very_low: () => `😔 Mår inte bra idag`,
    low: () => `😕 Känner sig lite låg idag`,
    neutral: () => `🙂 Allt är väl`,
    good: () => `☺️ Känner sig bra idag`,
    great: () => `😊 Känner sig väldigt glad idag`,
  },
  'zh-Hans': {
    title: (name: string) => `${name} 打卡`,
    fallback: (time: string) => `一切安好！- ${time}`,
    very_low: () => `😔 太不舒服`,
    low: () => `😕 有点低落`,
    neutral: () => `🙂 一切安好`,
    good: () => `☺️ 感觉不错`,
    great: () => `😊 今天很开心`,
  },
  'zh-Hant': {
    title: (name: string) => `${name} 打卡`,
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
  'zh-Hans': { leaving: '🧳 出发了', boarding: '🛫 登机／🚅 启程', layover: '🛑 中途停留/转机', landed: '🛬 已安全着陆', on_the_move: '🚕 在移动中', at_hotel: '🏨 已抵达酒店', on_trip: '🗺️ 旅程中', heading_home: '🏠 正在回家途中', trip_ended: '✅ 旅程结束—已安全到家' },
  'zh-Hant': { leaving: '🧳 出發了', boarding: '🛫 登機／🚅 啟程', layover: '🛑 中途停留／轉機', landed: '🛬 已安全著陸', on_the_move: '🚕 在移動中', at_hotel: '🏨 已抵達酒店', on_trip: '🗺️ 旅程中', heading_home: '🏠 正在回家途中', trip_ended: '✅ 旅程結束—已安全到家' },
}

function getTripStatusLabel(status: string, lang: string): string {
  const langMap = TRIP_STATUS_LABELS[lang] ?? TRIP_STATUS_LABELS.en
  return langMap[status] ?? TRIP_STATUS_LABELS.en[status] ?? status
}

const HOME_PRESENCE_LABELS: Record<string, Record<string, string>> = {
  en: {
    home: '🏠 At home',
    outside: '🚶 Outside',
    at_school: '🏫 At school',
    working: '💼 Working',
    busy: '💼 Busy',
    relaxing: '☕ Tea time',
    chilling: '🛋️ Chilling',
    gathering: '🥳 Hanging out',
    on_call: '📞 On a call',
    eating: '🍽️ Having a meal',
    exhausted: '😩 Exhausted',
    sleepy: '😪 Sleepy',
    daydreaming: '💭 Daydreaming',
    playing_sport: '🏃 Playing sport',
    having_fun: '🎉 Having a blast',
    watching_movie: '🎬 Watching a movie',
    resting: '😌 Resting',
    heading_home_alone: '🚶 Heading home alone',
    hiking_alone: '🥾 Hiking alone',
    goodmorning: '🌅 Good morning',
    goodafternoon: '🌞 Good afternoon',
    goodnight: '🌙 Good night',
  },
  da: {
    home: '🏠 Hjemme',
    outside: '🚶 Ude',
    at_school: '🏫 I skole',
    working: '💼 På arbejde',
    busy: '💼 Optaget',
    relaxing: '☕ Tepause',
    chilling: '🛋️ Chiller',
    gathering: '🥳 Hænger ud',
    on_call: '📞 I samtale',
    eating: '🍽️ Spiser',
    exhausted: '😩 Udmattet',
    sleepy: '😪 Søvnig',
    daydreaming: '💭 Dagdrømmer',
    playing_sport: '🏃 Spiller sport',
    having_fun: '🎉 Har det sjovt',
    watching_movie: '🎬 Ser film',
    resting: '😌 Hviler',
    heading_home_alone: '🚶 På vej hjem alene',
    hiking_alone: '🥾 Vandrer alene',
    goodmorning: '🌅 God morgen',
    goodafternoon: '🌞 God eftermiddag',
    goodnight: '🌙 God nat',
  },
  de: {
    home: '🏠 Zuhause',
    outside: '🚶 Unterwegs',
    at_school: '🏫 In der Schule',
    working: '💼 Bei der Arbeit',
    busy: '💼 Beschäftigt',
    relaxing: '☕ Teezeit',
    chilling: '🛋️ Chillen',
    gathering: '🥳 Beim Abhängen',
    on_call: '📞 Am Telefonieren',
    eating: '🍽️ Beim Essen',
    exhausted: '😩 Erschöpft',
    sleepy: '😪 Schläfrig',
    daydreaming: '💭 Tagträume',
    playing_sport: '🏃 Beim Sport',
    having_fun: '🎉 Habe viel Spaß',
    watching_movie: '🎬 Schaue einen Film',
    resting: '😌 Ruhe mich aus',
    heading_home_alone: '🚶 Allein auf dem Heimweg',
    hiking_alone: '🥾 Allein beim Wandern',
    goodmorning: '🌅 Guten Morgen',
    goodafternoon: '🌞 Guten Nachmittag',
    goodnight: '🌙 Gute Nacht',
  },
  es: {
    home: '🏠 En casa',
    outside: '🚶 Fuera',
    at_school: '🏫 En la escuela',
    working: '💼 Trabajando',
    busy: '💼 Ocupado',
    relaxing: '☕ Hora del té',
    chilling: '🛋️ En modo chill',
    gathering: '🥳 Socializando',
    on_call: '📞 En llamada',
    eating: '🍽️ Comiendo',
    exhausted: '😩 Agotado',
    sleepy: '😪 Somnoliento',
    daydreaming: '💭 Soñando despierto',
    playing_sport: '🏃 Haciendo deporte',
    having_fun: '🎉 Pasándola genial',
    watching_movie: '🎬 Viendo una película',
    resting: '😌 Descansando',
    heading_home_alone: '🚶 Volviendo a casa en solitario',
    hiking_alone: '🥾 De senderismo en solitario',
    goodmorning: '🌅 Buenos días',
    goodafternoon: '🌞 Buenas tardes',
    goodnight: '🌙 Buenas noches',
  },
  fi: {
    home: '🏠 Kotona',
    outside: '🚶 Ulkona',
    at_school: '🏫 Koulussa',
    working: '💼 Töissä',
    busy: '💼 Kiireinen',
    relaxing: '☕ Teehetki',
    chilling: '🛋️ Chillailen',
    gathering: '🥳 Seurustelemassa',
    on_call: '📞 Puhelimessa',
    eating: '🍽️ Syömässä',
    exhausted: '😩 Uupunut',
    sleepy: '😪 Uninen',
    daydreaming: '💭 Haaveilemassa',
    playing_sport: '🏃 Urheilemassa',
    having_fun: '🎉 Hauskaa pitäen',
    watching_movie: '🎬 Katsomassa elokuvaa',
    resting: '😌 Lepäämässä',
    heading_home_alone: '🚶 Matkalla kotiin yksin',
    hiking_alone: '🥾 Vaeltamassa yksin',
    goodmorning: '🌅 Hyvää huomenta',
    goodafternoon: '🌞 Hyvää iltapäivää',
    goodnight: '🌙 Hyvää yötä',
  },
  fr: {
    home: '🏠 À la maison',
    outside: '🚶 Sorti(e)',
    at_school: '🏫 À l’école',
    working: '💼 Au travail',
    busy: '💼 Occupé(e)',
    relaxing: '☕ Pause thé',
    chilling: '🛋️ Cocooning',
    gathering: '🥳 En train de socialiser',
    on_call: '📞 En appel',
    eating: '🍽️ En train de manger',
    exhausted: '😩 Épuisé',
    sleepy: '😪 Somnolent',
    daydreaming: '💭 Dans la lune',
    playing_sport: '🏃 Je fais du sport',
    having_fun: "🎉 Je m'amuse bien",
    watching_movie: '🎬 Je regarde un film',
    resting: '😌 Je me repose',
    heading_home_alone: '🚶 Sur le chemin du retour, seul·e',
    hiking_alone: '🥾 En randonnée en solo',
    goodmorning: '🌅 Bonjour',
    goodafternoon: '🌞 Bon après-midi',
    goodnight: '🌙 Bonne nuit',
  },
  it: {
    home: '🏠 A casa',
    outside: '🚶 Fuori',
    at_school: '🏫 A scuola',
    working: '💼 Al lavoro',
    busy: '💼 Occupato',
    relaxing: '☕ Pausa tè',
    chilling: '🛋️ Senza pensieri',
    gathering: '🥳 A socializzare',
    on_call: '📞 Al telefono',
    eating: '🍽️ Sto mangiando',
    exhausted: '😩 Esausto',
    sleepy: '😪 Assonnato',
    daydreaming: '💭 Sognando ad occhi aperti',
    playing_sport: '🏃 Faccio sport',
    having_fun: '🎉 Mi sto divertendo',
    watching_movie: '🎬 Guardo un film',
    resting: '😌 Mi sto riposando',
    heading_home_alone: '🚶 Verso casa da solo',
    hiking_alone: '🥾 In escursione in solitario',
    goodmorning: '🌅 Buongiorno',
    goodafternoon: '🌞 Buon pomeriggio',
    goodnight: '🌙 Buona notte',
  },
  ja: {
    home: '🏠 在宅',
    outside: '🚶 外出中',
    at_school: '🏫 学校にいます',
    working: '💼 仕事中',
    busy: '💼 忙しい',
    relaxing: '☕ お茶の時間',
    chilling: '🛋️ のんびり中',
    gathering: '🥳 集まっておしゃべり中',
    on_call: '📞 通話中',
    eating: '🍽️ 食事中',
    exhausted: '😩 くたくた',
    sleepy: '😪 眠い',
    daydreaming: '💭 ぼーっとしてる',
    playing_sport: '🏃 スポーツ中',
    having_fun: '🎉 めちゃ楽しんでる',
    watching_movie: '🎬 映画を観てる',
    resting: '😌 休憩中',
    heading_home_alone: '🚶 一人で帰宅中',
    hiking_alone: '🥾 一人でハイキング中',
    goodmorning: '🌅 おはよう',
    goodafternoon: '🌞 こんにちは',
    goodnight: '🌙 おやすみ',
  },
  ko: {
    home: '🏠 집에 있음',
    outside: '🚶 외출 중',
    at_school: '🏫 학교에 있어요',
    working: '💼 일하는 중',
    busy: '💼 바쁨',
    relaxing: '☕ 티타임',
    chilling: '🛋️ 멍 때리는 중',
    gathering: '🥳 모여서 수다 중',
    on_call: '📞 통화 중',
    eating: '🍽️ 밥 먹는 중',
    exhausted: '😩 너무 피곤해',
    sleepy: '😪 졸려',
    daydreaming: '💭 몽상 중',
    playing_sport: '🏃 운동 중',
    having_fun: '🎉 신나게 놀고 있어',
    watching_movie: '🎬 영화 보는 중',
    resting: '😌 쉬는 중',
    heading_home_alone: '🚶 혼자 귀가 중',
    hiking_alone: '🥾 혼자 하이킹 중',
    goodmorning: '🌅 좋은 아침',
    goodafternoon: '🌞 좋은 오후',
    goodnight: '🌙 잘 자요',
  },
  no: {
    home: '🏠 Hjemme',
    outside: '🚶 Ute',
    at_school: '🏫 På skolen',
    working: '💼 På jobb',
    busy: '💼 Opptatt',
    relaxing: '☕ Tepause',
    chilling: '🛋️ Chiller',
    gathering: '🥳 Henger med venner',
    on_call: '📞 I samtale',
    eating: '🍽️ Spiser',
    exhausted: '😩 Utmattet',
    sleepy: '😪 Søvnig',
    daydreaming: '💭 Dagdrømmer',
    playing_sport: '🏃 Spiller sport',
    having_fun: '🎉 Morer meg masse',
    watching_movie: '🎬 Ser på film',
    resting: '😌 Hviler',
    heading_home_alone: '🚶 På vei hjem alene',
    hiking_alone: '🥾 På fottur alene',
    goodmorning: '🌅 God morgen',
    goodafternoon: '🌞 God ettermiddag',
    goodnight: '🌙 God natt',
  },
  sv: {
    home: '🏠 Hemma',
    outside: '🚶 Ute',
    at_school: '🏫 I skolan',
    working: '💼 Jobbar',
    busy: '💼 Upptagen',
    relaxing: '☕ Fika',
    chilling: '🛋️ Chillar',
    gathering: '🥳 Umgås',
    on_call: '📞 I samtal',
    eating: '🍽️ Äter',
    exhausted: '😩 Utmattad',
    sleepy: '😪 Sömnig',
    daydreaming: '💭 Dagdrömmer',
    playing_sport: '🏃 Spelar sport',
    having_fun: '🎉 Har jättekul',
    watching_movie: '🎬 Ser på film',
    resting: '😌 Vilar',
    heading_home_alone: '🚶 På väg hem ensam',
    hiking_alone: '🥾 Vandrar ensam',
    goodmorning: '🌅 God morgon',
    goodafternoon: '🌞 God eftermiddag',
    goodnight: '🌙 God natt',
  },
  th: {
    home: '🏠 อยู่ที่บ้าน',
    outside: '🚶 ออกไปข้างนอก',
    at_school: '🏫 อยู่ที่โรงเรียน',
    working: '💼 กำลังทำงาน',
    busy: '💼 ไม่ว่าง',
    relaxing: '☕ เวลาน้ำชา',
    chilling: '🛋️ พักสมอง',
    gathering: '🥳 กำลังสังสรรค์',
    on_call: '📞 กำลังโทรศัพท์',
    eating: '🍽️ กำลังกินข้าว',
    exhausted: '😩 เหนื่อยมาก',
    sleepy: '😪 ง่วงนอน',
    daydreaming: '💭 ฝันกลางวัน',
    playing_sport: '🏃 กำลังเล่นกีฬา',
    having_fun: '🎉 สนุกมาก',
    watching_movie: '🎬 กำลังดูหนัง',
    resting: '😌 กำลังพักผ่อน',
    heading_home_alone: '🚶 กำลังกลับบ้านคนเดียว',
    hiking_alone: '🥾 เดินป่าคนเดียว',
    goodmorning: '🌅 อรุณสวัสดิ์',
    goodafternoon: '🌞 สวัสดีตอนบ่าย',
    goodnight: '🌙 ราตรีสวัสดิ์',
  },
  'zh-Hans': {
    home: '🏠 在家',
    outside: '🚶 外出中',
    at_school: '🏫 在学校',
    working: '💼 工作中',
    busy: '💼 忙碌中',
    relaxing: '☕ 茶歇时间',
    chilling: '🛋️ 悠闲中',
    gathering: '🥳 聚会聊天中',
    on_call: '📞 电话中',
    eating: '🍽️ 在吃饭',
    exhausted: '😩 好累',
    sleepy: '😪 困了',
    daydreaming: '💭 在发白日梦',
    playing_sport: '🏃 运动中',
    having_fun: '🎉 玩得很开心',
    watching_movie: '🎬 在看电影',
    resting: '😌 在休息',
    heading_home_alone: '🚶 独自回家路上',
    hiking_alone: '🥾 独自徒步',
    goodmorning: '🌅 早上好',
    goodafternoon: '🌞 午安',
    goodnight: '🌙 晚安',
  },
  'zh-Hant': {
    home: '🏠 在家',
    outside: '🚶 在外',
    at_school: '🏫 在學校',
    working: '💼 工作中',
    busy: '💼 忙碌中',
    relaxing: '☕ Tea time',
    chilling: '🛋️ 悠閒中',
    gathering: '🥳 聚會聊天中',
    on_call: '📞 電話中',
    eating: '🍽️ 食緊飯',
    exhausted: '😩 好攰',
    sleepy: '😪 眼瞓',
    daydreaming: '💭 在發白日夢',
    playing_sport: '🏃 運動中',
    having_fun: '🎉 玩得好開心',
    watching_movie: '🎬 在看電影',
    resting: '😌 在休息',
    heading_home_alone: '🚶 獨自回家路上',
    hiking_alone: '🥾 獨自行山',
    goodmorning: '🌅 早晨',
    goodafternoon: '🌞 午安',
    goodnight: '🌙 晚安',
  },
}

function getHomePresenceLabel(status: string, lang: string): string {
  const langMap = HOME_PRESENCE_LABELS[lang] ?? HOME_PRESENCE_LABELS.en
  return langMap[status] ?? HOME_PRESENCE_LABELS.en[status] ?? status
}

const REACH_OUT_STATUS_LABELS: Record<string, Record<string, string>> = {
  en:       { call_now: '✋ I need help', call_available: '📞 Call me' },
  da:       { call_now: '✋ Jeg har brug for hjælp', call_available: '📞 Ring til mig' },
  de:       { call_now: '✋ Ich brauche Hilfe', call_available: '📞 Ruf mich an' },
  es:       { call_now: '✋ Necesito ayuda', call_available: '📞 Llámame' },
  fi:       { call_now: '✋ Tarvitsen apua', call_available: '📞 Soita minulle' },
  fr:       { call_now: "✋ J'ai besoin d'aide", call_available: '📞 Appelle-moi' },
  it:       { call_now: '✋ Ho bisogno di aiuto', call_available: '📞 Chiamami' },
  ja:       { call_now: '✋ 助けが必要', call_available: '📞 電話して' },
  ko:       { call_now: '✋ 도움이 필요해', call_available: '📞 전화해줘' },
  no:       { call_now: '✋ Jeg trenger hjelp', call_available: '📞 Ring meg' },
  sv:       { call_now: '✋ Jag behöver hjälp', call_available: '📞 Ring mig' },
  th:       { call_now: '✋ ฉันต้องการความช่วยเหลือ', call_available: '📞 โทรหาฉัน' },
  'zh-Hans': { call_now: '✋ 我需要帮忙', call_available: '📞 打电话给我' },
  'zh-Hant': { call_now: '✋ 我需要幫忙', call_available: '📞 請call我' },
}

function getReachOutStatusLabel(status: string, lang: string): string {
  const langMap = REACH_OUT_STATUS_LABELS[lang] ?? REACH_OUT_STATUS_LABELS.en
  return langMap[status] ?? REACH_OUT_STATUS_LABELS.en[status] ?? status
}

const LOCATION_SHARED_LABELS: Record<string, string> = {
  en: '📍 Location shared',
  da: '📍 Position delt',
  de: '📍 Standort geteilt',
  es: '📍 Ubicación compartida',
  fi: '📍 Sijainti jaettu',
  fr: '📍 Position partagée',
  it: '📍 Posizione condivisa',
  ja: '📍 位置情報を共有中',
  ko: '📍 위치 공유 중',
  no: '📍 Posisjon delt',
  sv: '📍 Plats delad',
  th: '📍 แชร์ตำแหน่งแล้ว',
  'zh-Hans': '📍 已共享位置',
  'zh-Hant': '📍 已分享位置',
}

function getLocationSharedLabel(lang: string): string {
  return LOCATION_SHARED_LABELS[lang] ?? LOCATION_SHARED_LABELS.en
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
  const { data: entitlement, error: entitlementError } = await supabase
    .from('user_entitlements')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle()

  if (entitlementError) {
    console.error('Failed to load user entitlements, defaulting to free:', entitlementError.message)
    return 'free'
  }

  if (entitlement?.plan === 'plus') {
    return 'plus'
  }

  const [{ data: profile, error: profileError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('pilot_preview_activated_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('app_settings')
      .select('pilot_preview_enabled, pilot_preview_ends_at')
      .eq('id', 1)
      .maybeSingle(),
  ])

  if (profileError) {
    console.error('Failed to load user pilot preview profile:', profileError.message)
  }

  if (settingsError) {
    console.error('Failed to load pilot preview settings:', settingsError.message)
  }

  const previewOpen =
    settings?.pilot_preview_enabled === true &&
    !!settings.pilot_preview_ends_at &&
    new Date(settings.pilot_preview_ends_at).getTime() > Date.now()
  const previewActivated = !!profile?.pilot_preview_activated_at

  return previewOpen && previewActivated ? 'plus' : 'free'
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
  reachOutStatus: string | null,
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

  if (reachOutStatus) {
    data.reachOutStatus = reachOutStatus
  }

  const statusLabel = tripStatus
    ? getTripStatusLabel(tripStatus, recipientLang)
    : reachOutStatus
    ? getReachOutStatusLabel(reachOutStatus, recipientLang)
    : homePresence
    ? getHomePresenceLabel(homePresence, recipientLang)
    : null
  const emotionLabel = wellnessScore !== null
    ? getWellnessBody(locale, contactDisplayName, wellnessScore)
    : null
  const locationLabel = location ? getLocationSharedLabel(recipientLang) : null

  const bodyParts = [statusLabel, emotionLabel, locationLabel].filter(
    (part): part is string => !!part
  )

  const body = bodyParts.length > 0
    ? bodyParts.join(' · ')
    : locale.fallback(formattedTime)

  return {
    title: `${locale.title(contactDisplayName)} · ${formattedTime}`,
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

    const senderPlan = await getUserPlan(supabase, user_id)
    const isPlusSender = senderPlan === 'plus'
    const senderHomeStyle = await getUserHomeStyle(supabase, user_id)
    const canSendWellness = isPlusSender
    const canSendEnhancedStatus = isPlusSender && senderHomeStyle === 'enhanced'
    console.log('💳 Sender plan/style:', { senderPlan, senderHomeStyle })

    // ============================================
    // 4. Find contacts
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

    const { data: checkinRow, error: checkinError } = await supabase
      .from('checkins')
      .select('location_latitude, location_longitude, location_accuracy_meters, checked_in_at_utc, wellness_score, trip_status, home_presence, reach_out_status')
      .eq('user_id', user_id)
      .eq('checked_in_at_utc', checkin_time)
      .maybeSingle()

    if (checkinError) {
      throw checkinError
    }

    if (!checkinRow) {
      console.error('Exact check-in row was not found', { user_id, checkin_time })
      return new Response(JSON.stringify({
        error: 'Exact check-in row was not found',
        code: 'checkin_not_found'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const tripStatus: string | null = canSendEnhancedStatus
      ? checkinRow.trip_status ?? null
      : null

    const homePresence: string | null = canSendEnhancedStatus && !tripStatus
      ? checkinRow.home_presence ?? null
      : null

    const reachOutStatus: string | null = canSendEnhancedStatus && !tripStatus
      ? checkinRow.reach_out_status ?? null
      : null

    const sharedLocation: SharedLocation | null =
      isPlusSender &&
      checkinRow.location_latitude != null &&
      checkinRow.location_longitude != null
        ? {
            latitude: checkinRow.location_latitude,
            longitude: checkinRow.location_longitude,
            accuracyMeters: checkinRow.location_accuracy_meters ?? null,
          }
        : null

    const locationRecipientIds = new Set(
      eligibleContacts
        .filter((relationship) => relationship.location_sharing_enabled === true)
        .map((relationship) => relationship.contact_user_id)
    )

    const rawWellnessScore =
      canSendWellness && typeof checkinRow.wellness_score === 'number'
        ? checkinRow.wellness_score
        : null
    // Suppress wellness when user is in reach-out mode — the two messages contradict each other
    const wellnessScore = reachOutStatus ? null : rawWellnessScore

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

    // Reach-out (help) check-ins bypass deduplication — contacts should be
    // notified every time someone signals they need help, even repeatedly.
    const isReachOut = !!checkinRow.reach_out_status
    const dedupeWindowStart = new Date(new Date(checkin_time).getTime() - 1 * 60 * 1000).toISOString()
    const { data: existingNotifications, error: existingNotificationsError } = isReachOut
      ? { data: [], error: null }
      : await supabase
          .from('notifications')
          .select('user_id')
          .in('user_id', recipientIds)
          .eq('sender_user_id', user_id)
          .eq('type', 'contact_checkin')
          .gte('data->>checkinTimeIso', dedupeWindowStart)

    if (existingNotificationsError) throw existingNotificationsError

    const alreadyNotifiedUserIds = new Set(
      (existingNotifications || []).map((notification) => notification.user_id)
    )

    if (alreadyNotifiedUserIds.size > 0) {
      console.log('🧾 Existing notifications found for recipients:', [...alreadyNotifiedUserIds])
    }

    const { data: pushRecipients, error: tokensError } = await supabase
      .from('user_push_tokens')
      .select('user_id, expo_push_token, contact_checkin_notifications, aliyun_device_id')
      .in('user_id', recipientIds)

    if (tokensError) throw tokensError

    const pushRecipientMap = new Map(
      (pushRecipients || []).map((recipient) => [recipient.user_id, recipient])
    )

    console.log(`✅ Found ${pushRecipients?.length ?? 0} recipient push settings`)
    console.log(
      '📋 Recipient push settings:',
      (pushRecipients || []).map((recipient) => ({
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
    const aliyunMessages: { deviceId: string; title: string; body: string; data: Record<string, any> }[] = []

    const { data: recipientSettings } = await supabase
      .from('user_settings')
      .select('user_id, language')
      .in('user_id', recipientIds)

    const recipientLanguageMap = new Map(
      (recipientSettings || []).map((row) => [row.user_id, row.language])
    )

    const { data: recipientEntitlements } = await supabase
      .from('user_entitlements')
      .select('user_id, plan')
      .in('user_id', recipientIds)

    const { data: recipientProfiles } = await supabase
      .from('profiles')
      .select('id, pilot_preview_activated_at')
      .in('id', recipientIds)

    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('pilot_preview_enabled, pilot_preview_ends_at')
      .eq('id', 1)
      .maybeSingle()

    const previewOpen =
      appSettings?.pilot_preview_enabled === true &&
      !!appSettings.pilot_preview_ends_at &&
      new Date(appSettings.pilot_preview_ends_at).getTime() > Date.now()
    const paidRecipientIds = new Set(
      (recipientEntitlements || [])
        .filter((row: any) => row.plan === 'plus')
        .map((row: any) => row.user_id)
    )
    const previewRecipientIds = new Set(
      (recipientProfiles || [])
        .filter((row: any) => previewOpen && !!row.pilot_preview_activated_at)
        .map((row: any) => row.id)
    )

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')

    for (const recipientUserId of recipientIds) {
      if (alreadyNotifiedUserIds.has(recipientUserId)) {
        console.log(`⏩ Skipping duplicate notification for ${recipientUserId}`)
        continue
      }

      const recipientLang = recipientLanguageMap.get(recipientUserId) ?? 'en'
      const locale = getCheckinLocale(recipientLang)
      const isRecipientPlus =
        paidRecipientIds.has(recipientUserId) || previewRecipientIds.has(recipientUserId)
      const pushRecipient = pushRecipientMap.get(recipientUserId)

      const payload = buildContactCheckinNotification(
        locale,
        checkingUserName,
        formattedTime,
        user_id,
        recipientUserId,
        checkin_time,
        timezone,
        isRecipientPlus && sharedLocation && locationRecipientIds.has(recipientUserId)
          ? sharedLocation
          : null,
        isRecipientPlus ? wellnessScore : null,
        tripStatus,
        homePresence,
        reachOutStatus,
        recipientLang
      )

      notificationsToInsert.push({
        user_id: recipientUserId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sender_user_id: user_id,
        read: false,
        created_at: new Date().toISOString()
      })

      if (pushRecipient?.contact_checkin_notifications === true) {
        if (pushRecipient.expo_push_token && Expo.isExpoPushToken(pushRecipient.expo_push_token)) {
          messages.push({
            to: pushRecipient.expo_push_token,
            sound: 'default',
            title: payload.title,
            body: payload.body,
            data: { ...payload.data },
            channelId: 'contact-checkins',
            priority: 'high',
            badge: 1
          })
        } else if (pushRecipient.aliyun_device_id) {
          // Aliyun fallback for China Android users without Expo/FCM push
          aliyunMessages.push({
            deviceId: pushRecipient.aliyun_device_id,
            title: payload.title,
            body: payload.body,
            data: payload.data,
          })
        }
      }
    }

    // ============================================
    // 10. Save to notifications table
    // ============================================
    console.log(`💾 Saving ${notificationsToInsert.length} notifications`)
    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToInsert)

      if (insertError) throw insertError
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
    // 12. Send Aliyun push notifications (China Android fallback)
    // ============================================
    let aliyunSent = 0
    let aliyunFailed = 0
    if (aliyunMessages.length > 0) {
      console.log(`📱 Sending ${aliyunMessages.length} Aliyun push notifications`)
      for (const msg of aliyunMessages) {
        const result = await sendAliyunPushByDevice(msg.deviceId, {
          title: msg.title,
          body: msg.body,
          data: msg.data,
        })
        if (result.success) {
          aliyunSent++
        } else {
          aliyunFailed++
        }
      }
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
      pushes_failed: failedPushes.length,
      aliyun_sent: aliyunSent,
      aliyun_failed: aliyunFailed,
    }), { status: 200 })

  } catch (error) {
    console.error('💥 FATAL ERROR:', error)
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), { status: 500 })
  }
})
