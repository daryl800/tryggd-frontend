// supabase/functions/send-daily-reminders/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get current time in UTC
    const now = new Date()
    const currentHour = now.getUTCHours()
    const currentMinute = now.getUTCMinutes()
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`

    console.log(`🔍 Checking for users with reminder time: ${currentTime} UTC`)

    // ⭐ NEW: Get ALL users who need a reminder at this exact minute
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
        .eq('reminder_time', currentTime)
        .eq('enabled', true)
        .eq('user_settings.reminder_enabled', true)

    if (error) throw error

    if (!reminders?.length) {
      console.log('⏩ No users to remind at this time')
      return new Response(JSON.stringify({ message: 'No users to remind' }), { status: 200 })
    }

    console.log(`✅ Found ${reminders.length} users to remind`)

    // Get unique user IDs
    const userIds = [...new Set(reminders.map(r => r.user_id))]

    // Step: Get display names from profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)

    if (profilesError) throw profilesError

    // Create name map
    const userNames = {}
    for (const profile of profiles || []) {
      userNames[profile.id] = profile.display_name || 'there'
    }

    // Step: Filter out users who already checked in today
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const { data: checkins, error: checkinsError } = await supabase
      .from('checkins')
      .select('user_id')
      .in('user_id', userIds)
      .gte('checked_in_at_utc', today.toISOString())

    if (checkinsError) throw checkinsError

    const checkedInToday = new Set()
    for (const checkin of checkins || []) {
      checkedInToday.add(checkin.user_id)
    }

    // Filter to users who haven't checked in
    const usersToRemind = reminders.filter(r => !checkedInToday.has(r.user_id))
    
    console.log(`✅ ${usersToRemind.length} users haven't checked in yet today`)

    if (!usersToRemind.length) {
      console.log('⏩ All users already checked in today')
      return new Response(JSON.stringify({ message: 'All users already checked in' }), { status: 200 })
    }

    // Get push tokens for these users
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

    // Send notifications
    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
    const results = []

    function getGreeting(hour: number, name: string): { title: string; body: string } {
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

      if (hour >= 5 && hour < 12) {
        return greetings.morning[Math.floor(Math.random() * greetings.morning.length)]
      } else if (hour >= 12 && hour < 17) {
        return greetings.afternoon[Math.floor(Math.random() * greetings.afternoon.length)]
      } else if (hour >= 17 && hour < 21) {
        return greetings.evening[Math.floor(Math.random() * greetings.evening.length)]
      } else {
        return greetings.night[Math.floor(Math.random() * greetings.night.length)]
      }
    }

    // Create a map of which reminder times matched for each user
    const userReminderTimes = {}
    for (const reminder of usersToRemind) {
      if (!userReminderTimes[reminder.user_id]) {
        userReminderTimes[reminder.user_id] = []
      }
      userReminderTimes[reminder.user_id].push(reminder.reminder_time)
    }

    for (const token of tokens) {
      if (!token.expo_push_token) continue
      
      const userName = userNames[token.user_id] || 'there'
      const hour = new Date().getHours()
      const greeting = getGreeting(hour, userName)
      const matchedTimes = userReminderTimes[token.user_id] || [currentTime]

      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }

        if (expoAccessToken) {
          headers['Authorization'] = `Bearer ${expoAccessToken}`
        }

        const message = {
          to: token.expo_push_token,
          sound: 'default',
          title: greeting.title,
          body: greeting.body,
          data: { 
            type: 'daily_reminder',
            userId: token.user_id,
            reminderTimes: matchedTimes  // Optional: include which times matched
          },
          channelId: 'reminders',
          priority: 'high',
          badge: 1
        }

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers,
          body: JSON.stringify(message)
        })

        const result = await response.json()
        results.push({ 
          token: token.expo_push_token.substring(0, 15) + '...', 
          success: response.ok, 
          result,
          userName 
        })
        
        if (response.ok) {
          console.log(`✅ Push sent to ${token.expo_push_token.substring(0, 15)}... for ${userName}`)
        } else {
          console.error(`❌ Push failed for ${userName}`, result)
        }
      } catch (err) {
        console.error(`❌ Error sending to ${token.expo_push_token.substring(0, 15)}... for ${userName}`, err)
        results.push({ token: token.expo_push_token.substring(0, 15) + '...', error: err.message, userName })
      }
    }

    console.log(`✅ Processed ${results.length} notifications for users who haven't checked in`)

    return new Response(JSON.stringify({ 
      success: true, 
      sent: results.length,
      totalUsers: reminders.length,
      skipped: reminders.length - usersToRemind.length
    }), { status: 200 })

  } catch (error) {
    console.error('💥 Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})