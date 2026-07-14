// supabase/functions/send-daily-reminders/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Convert current UTC time to local HH:MM and local hour for a given timezone
function getLocalTimeInfo(timezone: string | null): { localTime: string; localHour: number } {
  try {
    const tz = timezone || 'UTC'
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = formatter.formatToParts(now)
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
    const localTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    return { localTime, localHour: hour }
  } catch {
    const now = new Date()
    const hour = now.getUTCHours()
    const minute = now.getUTCMinutes()
    return {
      localTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      localHour: hour,
    }
  }
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const nowUtc = new Date()
    const currentUtcTime = `${nowUtc.getUTCHours().toString().padStart(2, '0')}:${nowUtc.getUTCMinutes().toString().padStart(2, '0')}`
    console.log(`🔍 Running reminder check at ${currentUtcTime} UTC`)

    // Load ALL enabled reminders with timezone — filter by local time in JS
    const { data: reminders, error } = await supabase
      .from('user_reminder_times')
      .select(`
        user_id,
        reminder_time,
        user_settings!inner (
          timezone,
          reminder_enabled
        )
      `)
      .eq('enabled', true)
      .eq('user_settings.reminder_enabled', true)

    if (error) throw error

    if (!reminders?.length) {
      console.log('⏩ No enabled reminders found')
      return new Response(JSON.stringify({ message: 'No enabled reminders' }), { status: 200 })
    }

    // Filter to users whose local time matches their reminder_time
    const matched = reminders.filter(r => {
      const timezone = (r.user_settings as any)?.timezone ?? null
      const { localTime } = getLocalTimeInfo(timezone)
      const reminderTime = typeof r.reminder_time === 'string'
        ? r.reminder_time.slice(0, 5)   // trim seconds if present
        : ''
      const matches = localTime === reminderTime
      if (!matches) console.log(`⏭ ${r.user_id.slice(0, 8)} local=${localTime} reminder=${reminderTime} — skip`)
      return matches
    })

    if (!matched.length) {
      console.log('⏩ No users to remind at this local time')
      return new Response(JSON.stringify({ message: 'No users to remind' }), { status: 200 })
    }

    console.log(`✅ Found ${matched.length} user(s) whose local reminder time matches now`)

    const userIds = [...new Set(matched.map(r => r.user_id))]

    // Get display names
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)

    if (profilesError) throw profilesError

    const userNames: Record<string, string> = {}
    for (const profile of profiles || []) {
      userNames[profile.id] = profile.display_name || 'there'
    }

    // Filter out users who already checked in today (in their local timezone)
    const { data: checkins, error: checkinsError } = await supabase
      .from('checkins')
      .select('user_id')
      .in('user_id', userIds)
      .gte('checked_in_at_utc', new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000).toISOString())

    if (checkinsError) throw checkinsError

    const checkedInRecently = new Set((checkins || []).map(c => c.user_id))

    const usersToRemind = matched.filter(r => !checkedInRecently.has(r.user_id))

    console.log(`✅ ${usersToRemind.length} user(s) haven't checked in recently`)

    if (!usersToRemind.length) {
      console.log('⏩ All matched users already checked in')
      return new Response(JSON.stringify({ message: 'All users already checked in' }), { status: 200 })
    }

    // Get push tokens
    const remindUserIds = [...new Set(usersToRemind.map(r => r.user_id))]
    const { data: tokens, error: tokensError } = await supabase
      .from('user_push_tokens')
      .select('user_id, expo_push_token')
      .in('user_id', remindUserIds)
      .not('expo_push_token', 'is', null)

    if (tokensError) throw tokensError

    if (!tokens?.length) {
      console.log('⏩ No push tokens found')
      return new Response(JSON.stringify({ message: 'No push tokens' }), { status: 200 })
    }

    // Build timezone map for greeting
    const timezoneMap: Record<string, string | null> = {}
    for (const r of usersToRemind) {
      timezoneMap[r.user_id] = (r.user_settings as any)?.timezone ?? null
    }

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
    const results = []

    function getGreeting(localHour: number, name: string): { title: string; body: string } {
      const greetings = {
        morning: [
          { title: `🌅 Good morning ${name}!`, body: "💚 Hope you're having a great start. Quick check-in?" },
          { title: `☀️ Rise & shine ${name}`, body: "✨ Morning check-in? Let your people know you're okay" },
          { title: `🌤️ Hello ${name}`, body: "🌱 New day, same care. Check in when you're ready" }
        ],
        afternoon: [
          { title: `☀️ Hi ${name}!`, body: "✨ Just a gentle nudge - everything okay? Tap to check in" },
          { title: `🕊️ Thinking of you ${name}`, body: "💫 A quick check-in brings peace of mind" },
          { title: `🌟 Hello ${name}`, body: "💚 Your people care about you. Let them know you're fine" }
        ],
        evening: [
          { title: `🌆 Evening ${name}`, body: "💫 Before the night wraps up, let your people know you're fine" },
          { title: `🌇 Hi ${name}`, body: "🌙 How was your day? Quick check-in before evening settles?" },
          { title: `✨ Check in now, ${name}`, body: "💝 A small moment to connect with those who care" }
        ],
        night: [
          { title: `🌙 Good night ${name}`, body: "💤 One last thing - check in before you drift off to sleep" },
          { title: `⭐ Night check-in ${name}`, body: "🕊️ Peace of mind for you and your loved ones" },
          { title: `💫 Sweet dreams ${name}`, body: "🌙 Quick check-in? Then rest easy knowing you're connected" }
        ]
      }

      if (localHour >= 5 && localHour < 12) return greetings.morning[Math.floor(Math.random() * greetings.morning.length)]
      if (localHour >= 12 && localHour < 17) return greetings.afternoon[Math.floor(Math.random() * greetings.afternoon.length)]
      if (localHour >= 17 && localHour < 21) return greetings.evening[Math.floor(Math.random() * greetings.evening.length)]
      return greetings.night[Math.floor(Math.random() * greetings.night.length)]
    }

    for (const token of tokens) {
      if (!token.expo_push_token) continue

      const userName = userNames[token.user_id] || 'there'
      const tz = timezoneMap[token.user_id] ?? null
      const { localHour } = getLocalTimeInfo(tz)
      const greeting = getGreeting(localHour, userName)

      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
        if (expoAccessToken) headers['Authorization'] = `Bearer ${expoAccessToken}`

        const message = {
          to: token.expo_push_token,
          sound: 'default',
          title: greeting.title,
          body: greeting.body,
          data: { type: 'daily_reminder', userId: token.user_id },
          channelId: 'reminders',
          priority: 'high',
          badge: 1,
        }

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers,
          body: JSON.stringify(message),
        })

        const result = await response.json()
        results.push({ token: token.expo_push_token.substring(0, 15) + '...', success: response.ok, result, userName })

        if (response.ok) {
          console.log(`✅ Push sent to ${token.expo_push_token.substring(0, 15)}... for ${userName} (local hour: ${localHour})`)
        } else {
          console.error(`❌ Push failed for ${userName}`, result)
        }
      } catch (err) {
        console.error(`❌ Error sending to ${token.expo_push_token.substring(0, 15)}... for ${userName}`, err)
        results.push({ token: token.expo_push_token.substring(0, 15) + '...', error: err.message, userName })
      }
    }

    console.log(`✅ Processed ${results.length} notifications`)

    return new Response(JSON.stringify({
      success: true,
      sent: results.length,
      totalMatched: matched.length,
      skipped: matched.length - usersToRemind.length,
    }), { status: 200 })

  } catch (error) {
    console.error('💥 Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
