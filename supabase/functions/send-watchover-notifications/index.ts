// supabase/functions/send-watchover-notifications/index.ts
//
// Scheduled daily runner (called via external cron, same pattern as send-daily-reminders).
// Idempotent: checks day1_sent_at / day2_sent_at before sending anything.
//
// Episode lifecycle per run:
//   1. End episodes for watched users who have checked in since absence started.
//   2. For still-absent users: open episode if none exists; send day 1 or day 2 to watchers.
//   3. Bundle: one notification per watcher regardless of how many people they watch.
//   4. Skip watched users whose away_until > now().

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ABSENCE_THRESHOLD_MS  = 24 * 60 * 60 * 1000   // 24 h
const DAY2_THRESHOLD_MS     = 48 * 60 * 60 * 1000   // 48 h
const MAX_DAYS              = 2                       // stop notifying after day 2

type WatchPair = {
  watcher_user_id: string
  watched_user_id: string
}

type LatestCheckin = {
  user_id: string
  last_checked_in_utc: string | null
}

type EpisodeRow = {
  id: string
  watched_user_id: string
  absence_start_at: string
  status: string
}

type NotificationRow = {
  id: string
  episode_id: string
  watcher_user_id: string
  day1_sent_at: string | null
  day2_sent_at: string | null
}

type PushToken = {
  user_id: string
  expo_push_token: string | null
}

type ProfileRow = {
  id: string
  display_name: string | null
  away_until: string | null
}

// ──────────────────────────────────────────────
// Localization (server-side, watcher language)
// ──────────────────────────────────────────────
type Locale = 'en' | 'sv' | 'no' | 'da' | 'fi' | 'fr' | 'de' | 'es' | 'it' | 'ja' | 'ko' | 'zh-Hant' | 'zh-Hans'

function getWatcherLocale(lang?: string | null): Locale {
  const l = lang?.toLowerCase() ?? ''
  if (l.startsWith('sv')) return 'sv'
  if (l.startsWith('no') || l.startsWith('nb') || l.startsWith('nn')) return 'no'
  if (l.startsWith('da')) return 'da'
  if (l.startsWith('fi')) return 'fi'
  if (l.startsWith('fr')) return 'fr'
  if (l.startsWith('de')) return 'de'
  if (l.startsWith('es')) return 'es'
  if (l.startsWith('it')) return 'it'
  if (l.startsWith('ja')) return 'ja'
  if (l.startsWith('ko')) return 'ko'
  if (l === 'zh-hant' || l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 'zh-Hant'
  if (l === 'zh-hans' || l.startsWith('zh-cn') || l.startsWith('zh-sg')) return 'zh-Hans'
  return 'en'
}

type NotifStrings = { title: string; body: string }

const STRINGS: Record<Locale, {
  day1_single: (name: string) => NotifStrings
  day1_multi:  (count: number) => NotifStrings
  day2_single: (name: string) => NotifStrings
  day2_multi:  (count: number) => NotifStrings
}> = {
  en: {
    day1_single: (n) => ({ title: 'No check-in today',   body: `${n} has not checked in today.` }),
    day1_multi:  (c) => ({ title: 'No check-ins today',  body: `${c} people have not checked in today.` }),
    day2_single: (n) => ({ title: 'Still no check-in',   body: `${n} still hasn't checked in (2 days).` }),
    day2_multi:  (c) => ({ title: 'Still no check-ins',  body: `${c} people still haven't checked in (2 days).` }),
  },
  sv: {
    day1_single: (n) => ({ title: 'Ingen incheckning idag',      body: `${n} har inte checkat in idag.` }),
    day1_multi:  (c) => ({ title: 'Inga incheckningar idag',     body: `${c} personer har inte checkat in idag.` }),
    day2_single: (n) => ({ title: 'Fortfarande ingen incheckning', body: `${n} har fortfarande inte checkat in (2 dagar).` }),
    day2_multi:  (c) => ({ title: 'Fortfarande inga incheckningar', body: `${c} personer har fortfarande inte checkat in (2 dagar).` }),
  },
  no: {
    day1_single: (n) => ({ title: 'Ingen innsjekking i dag',      body: `${n} har ikke sjekket inn i dag.` }),
    day1_multi:  (c) => ({ title: 'Ingen innsjekkinger i dag',    body: `${c} personer har ikke sjekket inn i dag.` }),
    day2_single: (n) => ({ title: 'Fortsatt ingen innsjekking',   body: `${n} har fortsatt ikke sjekket inn (2 dager).` }),
    day2_multi:  (c) => ({ title: 'Fortsatt ingen innsjekkinger', body: `${c} personer har fortsatt ikke sjekket inn (2 dager).` }),
  },
  da: {
    day1_single: (n) => ({ title: 'Ingen check-in i dag',         body: `${n} har ikke checket ind i dag.` }),
    day1_multi:  (c) => ({ title: 'Ingen check-ins i dag',        body: `${c} personer har ikke checket ind i dag.` }),
    day2_single: (n) => ({ title: 'Stadig ingen check-in',        body: `${n} har stadig ikke checket ind (2 dage).` }),
    day2_multi:  (c) => ({ title: 'Stadig ingen check-ins',       body: `${c} personer har stadig ikke checket ind (2 dage).` }),
  },
  fi: {
    day1_single: (n) => ({ title: 'Ei kirjautumista tänään',      body: `${n} ei ole kirjautunut tänään.` }),
    day1_multi:  (c) => ({ title: 'Ei kirjautumisia tänään',      body: `${c} henkilöä ei ole kirjautunut tänään.` }),
    day2_single: (n) => ({ title: 'Edelleen ei kirjautumista',    body: `${n} ei ole vieläkään kirjautunut (2 päivää).` }),
    day2_multi:  (c) => ({ title: 'Edelleen ei kirjautumisia',    body: `${c} henkilöä ei ole vieläkään kirjautunut (2 päivää).` }),
  },
  fr: {
    day1_single: (n) => ({ title: "Pas d'enregistrement aujourd'hui", body: `${n} ne s'est pas enregistré aujourd'hui.` }),
    day1_multi:  (c) => ({ title: "Pas d'enregistrements aujourd'hui", body: `${c} personnes ne se sont pas enregistrées aujourd'hui.` }),
    day2_single: (n) => ({ title: 'Toujours pas d\'enregistrement',   body: `${n} ne s'est toujours pas enregistré (2 jours).` }),
    day2_multi:  (c) => ({ title: 'Toujours pas d\'enregistrements',  body: `${c} personnes ne se sont toujours pas enregistrées (2 jours).` }),
  },
  de: {
    day1_single: (n) => ({ title: 'Kein Check-in heute',          body: `${n} hat sich heute nicht eingecheckt.` }),
    day1_multi:  (c) => ({ title: 'Keine Check-ins heute',        body: `${c} Personen haben sich heute nicht eingecheckt.` }),
    day2_single: (n) => ({ title: 'Immer noch kein Check-in',     body: `${n} hat sich immer noch nicht eingecheckt (2 Tage).` }),
    day2_multi:  (c) => ({ title: 'Immer noch keine Check-ins',   body: `${c} Personen haben sich immer noch nicht eingecheckt (2 Tage).` }),
  },
  es: {
    day1_single: (n) => ({ title: 'Sin registro hoy',             body: `${n} no se ha registrado hoy.` }),
    day1_multi:  (c) => ({ title: 'Sin registros hoy',            body: `${c} personas no se han registrado hoy.` }),
    day2_single: (n) => ({ title: 'Sigue sin registrarse',        body: `${n} sigue sin registrarse (2 días).` }),
    day2_multi:  (c) => ({ title: 'Siguen sin registrarse',       body: `${c} personas siguen sin registrarse (2 días).` }),
  },
  it: {
    day1_single: (n) => ({ title: 'Nessun check-in oggi',         body: `${n} non ha effettuato il check-in oggi.` }),
    day1_multi:  (c) => ({ title: 'Nessun check-in oggi',         body: `${c} persone non hanno effettuato il check-in oggi.` }),
    day2_single: (n) => ({ title: 'Ancora nessun check-in',       body: `${n} non ha ancora effettuato il check-in (2 giorni).` }),
    day2_multi:  (c) => ({ title: 'Ancora nessun check-in',       body: `${c} persone non hanno ancora effettuato il check-in (2 giorni).` }),
  },
  ja: {
    day1_single: (n) => ({ title: '本日未チェックイン',            body: `${n} さんが本日チェックインしていません。` }),
    day1_multi:  (c) => ({ title: `${c}人が未チェックイン`,         body: `${c}人が本日チェックインしていません。` }),
    day2_single: (n) => ({ title: 'まだチェックインなし',           body: `${n} さんがまだチェックインしていません（2日間）。` }),
    day2_multi:  (c) => ({ title: `${c}人がまだ未チェックイン`,     body: `${c}人がまだチェックインしていません（2日間）。` }),
  },
  ko: {
    day1_single: (n) => ({ title: '오늘 체크인 없음',              body: `${n}님이 오늘 체크인하지 않았습니다.` }),
    day1_multi:  (c) => ({ title: `${c}명 체크인 없음`,            body: `${c}명이 오늘 체크인하지 않았습니다.` }),
    day2_single: (n) => ({ title: '아직도 체크인 없음',            body: `${n}님이 아직도 체크인하지 않았습니다 (2일째).` }),
    day2_multi:  (c) => ({ title: `${c}명 아직도 체크인 없음`,     body: `${c}명이 아직도 체크인하지 않았습니다 (2일째).` }),
  },
  'zh-Hant': {
    day1_single: (n) => ({ title: '今日未打卡',                    body: `${n} 今日尚未打卡。` }),
    day1_multi:  (c) => ({ title: `${c}人今日未打卡`,             body: `${c} 人今日尚未打卡。` }),
    day2_single: (n) => ({ title: '仍未打卡',                      body: `${n} 仍未打卡（已 2 天）。` }),
    day2_multi:  (c) => ({ title: `${c}人仍未打卡`,               body: `${c} 人仍未打卡（已 2 天）。` }),
  },
  'zh-Hans': {
    day1_single: (n) => ({ title: '今日未打卡',                    body: `${n} 今日尚未打卡。` }),
    day1_multi:  (c) => ({ title: `${c}人今日未打卡`,             body: `${c} 人今日尚未打卡。` }),
    day2_single: (n) => ({ title: '仍未打卡',                      body: `${n} 仍未打卡（已 2 天）。` }),
    day2_multi:  (c) => ({ title: `${c}人仍未打卡`,               body: `${c} 人仍未打卡（已 2 天）。` }),
  },
}

// ──────────────────────────────────────────────
// Push helper
// ──────────────────────────────────────────────
async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  accessToken?: string
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({ to: token, title, body, data, sound: 'default', priority: 'high', channelId: 'watch-over' }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Push failed for token ${token.slice(0, 20)}…: ${text}`)
  }
}

// ──────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────
serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  const now = Date.now()

  // ── 1. Load all active watch pairs ──────────
  const { data: pairs, error: pairsErr } = await supabase
    .from('contacts')
    .select('owner_user_id, contact_user_id')
    .eq('watch_over_enabled', true) as { data: { owner_user_id: string; contact_user_id: string }[] | null; error: unknown }

  if (pairsErr) {
    console.error('Failed to load watch pairs', pairsErr)
    return new Response(JSON.stringify({ error: 'Failed to load watch pairs' }), { status: 500 })
  }
  if (!pairs?.length) {
    console.log('No active watch pairs')
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  const watchedIds  = [...new Set(pairs.map(p => p.contact_user_id))]
  const watcherIds  = [...new Set(pairs.map(p => p.owner_user_id))]

  // ── 2. Load profiles (display names + away status) ──
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, away_until')
    .in('id', [...watchedIds, ...watcherIds]) as { data: ProfileRow[] | null; error: unknown }

  const profileMap = new Map<string, ProfileRow>()
  for (const p of profiles ?? []) profileMap.set(p.id, p)

  // ── 3. Load latest check-in timestamps ──────
  const { data: checkins } = await supabase
    .from('users_latest_checkin')
    .select('user_id, last_checked_in_utc')
    .in('user_id', watchedIds) as { data: LatestCheckin[] | null; error: unknown }

  const checkinMap = new Map<string, string | null>()
  for (const c of checkins ?? []) checkinMap.set(c.user_id, c.last_checked_in_utc)

  // ── 4. Classify each watched user ──────────
  // absent:  last_checked_in_utc > ABSENCE_THRESHOLD_MS ago (or never)
  // present: checked in within 24h
  const absent:  string[] = []
  const present: string[] = []

  for (const watchedId of watchedIds) {
    const profile = profileMap.get(watchedId)

    // Skip users who are away
    if (profile?.away_until && new Date(profile.away_until).getTime() > now) {
      console.log(`⏭ ${watchedId} is away until ${profile.away_until}`)
      continue
    }

    const lastCheckin = checkinMap.get(watchedId)
    const lastCheckinMs = lastCheckin ? new Date(lastCheckin).getTime() : 0
    const absentMs = now - lastCheckinMs

    if (absentMs >= ABSENCE_THRESHOLD_MS) {
      absent.push(watchedId)
    } else {
      present.push(watchedId)
    }
  }

  // ── 5. End episodes for users who checked in ──
  if (present.length > 0) {
    const { error: endErr } = await supabase
      .from('watch_over_episodes')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .in('watched_user_id', present)
      .eq('status', 'active')

    if (endErr) console.error('Failed to end episodes', endErr)
    else console.log(`✅ Ended episodes for ${present.length} returned users`)
  }

  if (absent.length === 0) {
    console.log('No absent users — done')
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  // ── 6. Load or create episodes for absent users ──
  const { data: existingEpisodes } = await supabase
    .from('watch_over_episodes')
    .select('id, watched_user_id, absence_start_at, status')
    .in('watched_user_id', absent)
    .eq('status', 'active') as { data: EpisodeRow[] | null; error: unknown }

  const episodeMap = new Map<string, EpisodeRow>()
  for (const ep of existingEpisodes ?? []) episodeMap.set(ep.watched_user_id, ep)

  // Create missing episodes
  const toCreate = absent.filter(id => !episodeMap.has(id))
  if (toCreate.length > 0) {
    const { data: created, error: createErr } = await supabase
      .from('watch_over_episodes')
      .insert(toCreate.map(id => ({
        watched_user_id: id,
        absence_start_at: new Date(now - ABSENCE_THRESHOLD_MS).toISOString(),
        status: 'active',
      })))
      .select('id, watched_user_id, absence_start_at, status') as { data: EpisodeRow[] | null; error: unknown }

    if (createErr) {
      console.error('Failed to create episodes', createErr)
    } else {
      for (const ep of created ?? []) episodeMap.set(ep.watched_user_id, ep)
    }
  }

  // ── 7. Load notification records for active episodes ──
  const episodeIds = [...episodeMap.values()].map(ep => ep.id)
  const { data: notifRows } = await supabase
    .from('watch_over_notifications')
    .select('id, episode_id, watcher_user_id, day1_sent_at, day2_sent_at')
    .in('episode_id', episodeIds) as { data: NotificationRow[] | null; error: unknown }

  // notifMap: episodeId → watcherUserId → NotificationRow
  const notifMap = new Map<string, Map<string, NotificationRow>>()
  for (const row of notifRows ?? []) {
    if (!notifMap.has(row.episode_id)) notifMap.set(row.episode_id, new Map())
    notifMap.get(row.episode_id)!.set(row.watcher_user_id, row)
  }

  // ── 8. Load push tokens for watchers ────────
  const { data: pushTokens } = await supabase
    .from('user_push_tokens')
    .select('user_id, expo_push_token')
    .in('user_id', watcherIds) as { data: PushToken[] | null; error: unknown }

  const tokenMap = new Map<string, string>()
  for (const t of pushTokens ?? []) {
    if (t.expo_push_token) tokenMap.set(t.user_id, t.expo_push_token)
  }

  // ── 9. Load watcher language preferences ────
  const { data: watcherSettings } = await supabase
    .from('user_settings')
    .select('user_id, language')
    .in('user_id', watcherIds) as { data: { user_id: string; language: string | null }[] | null; error: unknown }

  const langMap = new Map<string, string>()
  for (const s of watcherSettings ?? []) {
    if (s.language) langMap.set(s.user_id, s.language)
  }

  // ── 10. Build per-watcher send list ─────────
  // For each watcher: collect which absent people need day1 or day2 notifications
  type SendJob = {
    watcherId: string
    day: 1 | 2
    names: string[]         // display names of absent watched people
    episodeIds: string[]    // episode ids to mark as sent
  }

  const watcherDay1: Map<string, { names: string[]; episodeIds: string[] }> = new Map()
  const watcherDay2: Map<string, { names: string[]; episodeIds: string[] }> = new Map()

  for (const watchedId of absent) {
    const episode = episodeMap.get(watchedId)
    if (!episode) continue

    const absenceMs = now - new Date(episode.absence_start_at).getTime()
    const watchedName = profileMap.get(watchedId)?.display_name ?? 'Someone'

    // Find all watchers of this person
    const watchers = pairs
      .filter(p => p.contact_user_id === watchedId)
      .map(p => p.owner_user_id)

    for (const watcherId of watchers) {
      const notifByWatcher = notifMap.get(episode.id)
      const existingNotif = notifByWatcher?.get(watcherId)

      if (absenceMs >= ABSENCE_THRESHOLD_MS && absenceMs < DAY2_THRESHOLD_MS) {
        // Day 1 window: 24h–48h
        if (!existingNotif?.day1_sent_at) {
          if (!watcherDay1.has(watcherId)) watcherDay1.set(watcherId, { names: [], episodeIds: [] })
          const entry = watcherDay1.get(watcherId)!
          entry.names.push(watchedName)
          entry.episodeIds.push(episode.id)
        }
      } else if (absenceMs >= DAY2_THRESHOLD_MS && absenceMs < MAX_DAYS * ABSENCE_THRESHOLD_MS + ABSENCE_THRESHOLD_MS) {
        // Day 2 window: 48h–72h
        if (existingNotif?.day1_sent_at && !existingNotif?.day2_sent_at) {
          if (!watcherDay2.has(watcherId)) watcherDay2.set(watcherId, { names: [], episodeIds: [] })
          const entry = watcherDay2.get(watcherId)!
          entry.names.push(watchedName)
          entry.episodeIds.push(episode.id)
        }
      }
    }
  }

  // ── 11. Send and record ──────────────────────
  let sent = 0
  const nowIso = new Date().toISOString()

  const sendJobs: SendJob[] = [
    ...[...watcherDay1.entries()].map(([watcherId, data]) => ({ watcherId, day: 1 as const, ...data })),
    ...[...watcherDay2.entries()].map(([watcherId, data]) => ({ watcherId, day: 2 as const, ...data })),
  ]

  for (const job of sendJobs) {
    const token = tokenMap.get(job.watcherId)
    if (!token) continue

    const locale = getWatcherLocale(langMap.get(job.watcherId))
    const strings = STRINGS[locale]
    const count = job.names.length

    const { title, body } = job.day === 1
      ? (count === 1 ? strings.day1_single(job.names[0]) : strings.day1_multi(count))
      : (count === 1 ? strings.day2_single(job.names[0]) : strings.day2_multi(count))

    try {
      await sendExpoPush(token, title, body, {
        type: 'watch_over_absence',
        day: job.day,
        watchedNames: job.names,
        episodeIds: job.episodeIds,
      }, expoAccessToken)

      // Record notification as sent (upsert for idempotency)
      for (const episodeId of job.episodeIds) {
        await supabase
          .from('watch_over_notifications')
          .upsert({
            episode_id: episodeId,
            watcher_user_id: job.watcherId,
            ...(job.day === 1 ? { day1_sent_at: nowIso } : { day2_sent_at: nowIso }),
          }, { onConflict: 'episode_id,watcher_user_id', ignoreDuplicates: false })
      }

      sent++
      console.log(`📬 Day ${job.day} → ${job.watcherId.slice(0, 8)} (${count} person(s))`)
    } catch (e) {
      console.error(`Failed to push to ${job.watcherId}`, e)
    }
  }

  console.log(`✅ Done — sent ${sent} notifications`)
  return new Response(JSON.stringify({ sent }), { status: 200 })
})
