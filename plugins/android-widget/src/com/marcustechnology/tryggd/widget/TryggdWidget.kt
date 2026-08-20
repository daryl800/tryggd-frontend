// plugins/android-widget/src/com/marcustechnology/tryggd/widget/TryggdWidget.kt
//
// SOURCE location for Tryggd's Android Home Screen widget (Jetpack Glance).
// This file is NOT built from here directly — plugins/withAndroidWidget.js
// copies this whole directory into android/app/src/main/java/... on every
// `npx expo prebuild`. Edit here, not in the generated android/ folder —
// see docs/home-screen-widget.md.
//
// Unlike iOS, an Android widget runs inside the app's own process, so it
// reads the SharedPreferences file written directly by
// modules/tryggd-widget-bridge/android — no App-Group-style shared
// container needed on this platform.
//
// V2: an ACTION SURFACE, not a status dashboard. See
// docs/home-screen-widget.md for the full history: V1 showed trusted
// contacts' check-in status, but that data could only ever be as fresh as
// the last time the app itself was open (widgets can't poll in the
// background), and a stale "hasn't checked in in 2 days" for someone who
// actually just checked in caused real confusion/worry — exactly what
// this app exists to prevent. V2 shows ONLY the current user's own
// check-in completion (reliable — it's always initiated from this
// device) plus two always-available actions:
//   - Check In: "I'm okay"
//   - Asked to Send Money: the existing anti-fraud alert flow
//
// There is no Android equivalent of iOS's Lock Screen accessory widgets
// (Android's own lock-screen-widget mechanism was deprecated years ago on
// the platform and isn't something Glance targets), so this file is the
// whole Android widget surface — see targets/widget/TryggdWidget.swift for
// the iOS Home Screen widget PLUS its two separate Lock Screen shortcuts.
//
// Tapping either action opens the main app and deep-links to the existing
// screen/flow (see the URI constants below) — this file does NOT
// duplicate check-in or anti-fraud-alert logic. In particular, tapping
// "Asked to Send Money" only OPENS the existing Help flow; it does not
// send the alert itself. That requires a deliberate tap inside the app —
// see the comment on moneyHelpUri. For the same reason, unlike the old V1
// layout, there is deliberately NO blanket "tap anywhere on the widget"
// action here — only the two button rows are tappable, so an accidental
// touch on the widget's background does nothing.
package com.marcustechnology.tryggd.widget

// R is generated in the app module's root package (com.marcustechnology.tryggd —
// see app.config.js `android.package`), one level up from this widget
// subpackage, so it needs an explicit import rather than resolving
// automatically. Holds the string resources this file reads via
// context.getString(...) — see plugins/android-widget/res/values*/strings.xml.
import com.marcustechnology.tryggd.R
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
// NOTE: FontWeight, TextStyle, and friends are Glance's OWN reimplementation
// of the compose-ui text types (Glance content isn't real Compose UI — it
// renders to RemoteViews), so they live under androidx.glance.text, NOT
// androidx.compose.ui.text.font. Glance's FontWeight only defines Normal,
// Medium, and Bold — no SemiBold — unlike compose-ui's FontWeight.
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
// semantics/contentDescription live under the androidx.glance.semantics
// package as top-level functions/properties, imported individually (the
// package itself cannot be imported as a symbol).
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
// ColorProvider(color: Color) is androidx.glance.unit.ColorProvider in this
// pinned Glance version (1.1.1) — NOT top-level androidx.glance.ColorProvider,
// which is only valid on newer Glance releases.
import androidx.glance.unit.ColorProvider
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.util.Date

private const val PREFS_NAME = "tryggd_widget_prefs"
private const val SNAPSHOT_KEY = "widget_snapshot_json"

// Deep links — MUST match the URIs used by targets/widget/TryggdWidget.swift
// (checkInURL / moneyHelpURL) so both platforms resolve to the exact same
// app/(tabs)/index.tsx route + query-param handling. See that file's
// comment for the safety rationale on why "Asked to Send Money" only opens
// the Help screen rather than sending the alert directly, and for why
// CHECK_IN_URI explicitly carries mode=home (checkinMode is persisted
// across app opens, so a bare deep link could otherwise land on whatever
// tab — Trip, Reach Out — was last active instead of Daily).
private const val CHECK_IN_URI = "tryggd://?mode=home"
private const val MONEY_HELP_URI = "tryggd://?mode=help"

// Brand colors (mirrors constants/colors.ts BaseColors)

private val CheckGreen = Color(0xFF5FA893)
private val AttentionAmber = Color(0xFFF59E0B)
private val AttentionAmberSoftBackground = Color(0xFFFDF3E3)
private val TextDark = Color(0xFF1F2937)
private val TextMuted = Color(0xFF5E7F74)
private val WidgetBackground = Color(0xFFFBFBFA)
private val White = Color(0xFFFFFFFF)

// MARK: - Snapshot model + parsing (mirrors lib/widget/types.ts WidgetOwnState)
//
// Deliberately carries NO trusted-circle data and NO resolved UI text —
// see lib/widget/types.ts for why. All display strings in this file come
// from this module's own strings.xml resources (values*/strings.xml under
// plugins/android-widget/res/), not from the snapshot.

data class WidgetOwnState(
  val updatedAt: String,
  val isLoggedIn: Boolean,
  val checkedInToday: Boolean,
  val lastCheckinUtc: String?,
  // The user's own most recent `money_transfer_help` send — see
  // lib/widget/types.ts. Not reset on day rollover, unlike checkedInToday:
  // a "sent yesterday" alert is still meaningful, not stale in the way an
  // old check-in status would be.
  val lastMoneyAlertSentUtc: String?,
)

internal fun parseSnapshot(json: String?): WidgetOwnState? {
  if (json == null) return null
  return try {
    val root = JSONObject(json)
    WidgetOwnState(
      updatedAt = root.getString("updatedAt"),
      isLoggedIn = root.optBoolean("isLoggedIn", false),
      checkedInToday = root.optBoolean("checkedInToday", false),
      lastCheckinUtc = if (root.isNull("lastCheckinUtc")) null else root.getString("lastCheckinUtc"),
      lastMoneyAlertSentUtc = if (root.isNull("lastMoneyAlertSentUtc")) null else root.getString("lastMoneyAlertSentUtc"),
    )
  } catch (error: Exception) {
    null
  }
}

private fun parseIsoInstant(value: String?): Instant? {
  if (value == null) return null
  return try {
    Instant.parse(value)
  } catch (error: Exception) {
    null
  }
}

/** Locale-aware absolute clock time (respects the device's 12h/24h
 * setting), matching iOS's `Text(date, style: .time)` — same idea, correct
 * platform-native API instead of hand-rolling formatting/localization. */
private fun formatTimeOfDay(context: Context, instant: Instant): String {
  val timeFormat = android.text.format.DateFormat.getTimeFormat(context)
  return timeFormat.format(Date.from(instant))
}

/** Re-derives "checked in today" from the raw timestamp against the
 * CURRENT local calendar day, rather than only trusting `checkedInToday`
 * as written — that boolean could be a day stale if this widget hasn't
 * been refreshed since. Spec: "Handle timezone/date changes sensibly" —
 * ZoneId.systemDefault() always reflects the device's current timezone,
 * so this self-corrects if the user has traveled.
 *
 * NOTE — platform difference from iOS: WidgetKit lets TryggdWidget.swift
 * schedule a timeline entry for exactly the next local midnight, so that
 * widget flips itself back to "Check In" overnight with no trigger at
 * all. Jetpack Glance has no equivalent "render at a future time"
 * primitive, and updatePeriodMillis (see tryggd_widget_info.xml) is
 * disabled in favor of app-driven refreshes. So on Android this
 * re-derivation is the ONLY reset mechanism, and it only runs the next
 * time provideGlance() is actually invoked — a widget tap, an app open
 * that pushes a fresh snapshot, an app-triggered widget update, or one of
 * Android's own occasional widget refresh passes (e.g. on unlock). In the
 * rare case none of those happen between local midnight and the next
 * interaction, the widget may cosmetically keep showing "Checked In
 * Today" for a while into the new day; the moment anything re-renders it,
 * this function corrects it. This never affects the ACTUAL check-in
 * state — that's tracked by app/(tabs)/index.tsx's own audited
 * checkDateAndReset/isSameDay logic regardless of what the widget shows.
 */
private fun isCheckedInNow(state: WidgetOwnState): Boolean {
  if (!state.checkedInToday) return false
  val lastCheckin = parseIsoInstant(state.lastCheckinUtc) ?: return state.checkedInToday
  val zone = ZoneId.systemDefault()
  val today = Instant.now().atZone(zone).toLocalDate()
  val checkinDate = lastCheckin.atZone(zone).toLocalDate()
  return checkinDate == today
}

// MARK: - Widget

class TryggdWidget : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val state = parseSnapshot(prefs.getString(SNAPSHOT_KEY, null))

    provideContent {
      TryggdWidgetContent(context, state)
    }
  }
}

class TryggdWidgetReceiver : androidx.glance.appwidget.GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = TryggdWidget()
}

@Composable
private fun TryggdWidgetContent(context: Context, state: WidgetOwnState?) {
  // verticalAlignment = CenterVertically: Android widget sizes snap to
  // whatever grid cell units the LAUNCHER uses, not exact dp — there's no
  // dp value in tryggd_widget_info.xml that guarantees a pixel-perfect fit
  // on every device, so the launcher can grant more height than the
  // content actually needs. GlanceModifier.defaultWeight() would be the
  // "right" fix (let a box grow to fill it) but isn't available in this
  // project's pinned Glance 1.1.1 (compiler: unresolved reference — that
  // API came later). Centering the whole block instead means any extra
  // granted height gets distributed above/below the content as a group,
  // rather than all dumped as a blank gap below the last row.
  Column(
    modifier = GlanceModifier
      .fillMaxSize()
      .background(WidgetBackground)
      .padding(14.dp),
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    if (state != null && state.isLoggedIn) {
      LoggedInBody(context, state)
    } else {
      LoggedOutBody(context)
    }
  }
}

@Composable
private fun TitleRow() {
  Row(verticalAlignment = Alignment.Vertical.CenterVertically) {
    Text(
      text = "Tryggd",
      style = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ColorProvider(TextDark)),
    )
    Spacer(modifier = GlanceModifier.width(4.dp))
    Text(text = "💚" /* 💚 */, style = TextStyle(fontSize = 15.sp))
  }
}

// V2.2 (per direct user feedback — big, glanceable content instead of
// small compact rows): title, then one BIG status/prompt row (👋🏻 before
// check-in, ✅ after — see BigCheckInPrompt/BigCheckedInStatus), then one
// BIG "Send Money" row, always tappable (BigMoneyAlertButton). TalkBack
// still gets separate, clean contentDescription text rather than reading
// the emoji verbatim — same split iOS's Swift file uses.
@Composable
private fun LoggedInBody(context: Context, state: WidgetOwnState) {
  val checkedIn = isCheckedInNow(state)

  TitleRow()
  Spacer(modifier = GlanceModifier.height(8.dp))

  if (checkedIn) {
    BigCheckedInStatus(context, lastCheckinUtc = state.lastCheckinUtc)
  } else {
    BigCheckInPrompt(
      context = context,
      onClick = actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(CHECK_IN_URI))),
    )
  }

  Spacer(modifier = GlanceModifier.height(8.dp))
  BigMoneyAlertButton(
    context = context,
    lastSentUtc = state.lastMoneyAlertSentUtc,
    onClick = actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(MONEY_HELP_URI))),
  )
}

/** BIG "not checked in yet" prompt — the primary tap target for opening
 * the check-in flow. Per spec §6, Check In must disappear as an ACTIVE
 * BUTTON once done for the day — see BigCheckedInStatus below for the
 * read-only counterpart shown once checked in. Doubled 👋🏻👋🏻 and "Please
 * check-in!" wording per direct user feedback. Stacked vertically (Column,
 * emoji row then label row) rather than side-by-side in one Row — matches
 * the iOS redesign, and gives the emoji its own line instead of competing
 * for width with the label text. */
@Composable
private fun BigCheckInPrompt(context: Context, onClick: Action) {
  Column(
    modifier = GlanceModifier
      .fillMaxWidth()
      .background(CheckGreen)
      .padding(vertical = 10.dp, horizontal = 12.dp)
      .clickable(onClick)
      .semantics {
        contentDescription =
          "${context.getString(R.string.tryggd_widget_check_in)}. " +
            context.getString(R.string.tryggd_widget_check_in_hint)
      },
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    Text(text = "👋🏻👋🏻", style = TextStyle(fontSize = 26.sp))
    Text(
      text = context.getString(R.string.tryggd_widget_please_check_in),
      maxLines = 1,
      style = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ColorProvider(White)),
    )
  }
}

/** BIG "already checked in" status — informational only, no clickable
 * background chrome (nothing left to tap). Shows the actual check-in TIME
 * (per direct user feedback, replacing the earlier generic "Checked In
 * Today") via formatTimeOfDay — a locale-formatted absolute clock time
 * respecting the device's 12h/24h setting. TalkBack gets the clean
 * "Checked In Today" label rather than reading the emoji or raw time. */
@Composable
private fun BigCheckedInStatus(context: Context, lastCheckinUtc: String?) {
  val checkinInstant = parseIsoInstant(lastCheckinUtc)
  Column(
    modifier = GlanceModifier
      .fillMaxWidth()
      .semantics {
        contentDescription = context.getString(R.string.tryggd_widget_checked_in_today)
      },
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    Text(text = "✅", style = TextStyle(fontSize = 26.sp))
    val label = if (checkinInstant != null) {
      "${context.getString(R.string.tryggd_widget_last_checked_in)} ${formatTimeOfDay(context, checkinInstant)}"
    } else {
      context.getString(R.string.tryggd_widget_check_in_today)
    }
    Text(
      text = label,
      maxLines = 1,
      style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ColorProvider(CheckGreen)),
    )
  }
}

/** BIG "Send Money Alert" shortcut — always tappable regardless of
 * check-in state. Stacked vertically: bookended 💸⚠️ emoji, the "Send
 * Money Alert!" label, then a smaller "Last sent" line using the SAME
 * data source as the Help screen's own per-button timestamp (see
 * lib/api/helpRequest.ts fetchLastHelpRequestByType — this is not a new
 * tracking mechanism) — "--:--" if the user has never sent one. */
@Composable
private fun BigMoneyAlertButton(context: Context, lastSentUtc: String?, onClick: Action) {
  val lastSentInstant = parseIsoInstant(lastSentUtc)
  val lastSentTime = if (lastSentInstant != null) formatTimeOfDay(context, lastSentInstant) else "--:--"
  Column(
    modifier = GlanceModifier
      .fillMaxWidth()
      .background(AttentionAmberSoftBackground)
      .padding(vertical = 10.dp, horizontal = 12.dp)
      .clickable(onClick)
      .semantics {
        contentDescription =
          "${context.getString(R.string.tryggd_widget_asked_to_send_money)}. " +
            context.getString(R.string.tryggd_widget_money_help_hint)
      },
    verticalAlignment = Alignment.Vertical.CenterVertically,
  ) {
    Text(text = "💸⚠️", style = TextStyle(fontSize = 22.sp))
    Text(
      text = context.getString(R.string.tryggd_widget_send_money_alert),
      maxLines = 1,
      style = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ColorProvider(AttentionAmber)),
    )
    Text(
      text = "➡️ ${context.getString(R.string.tryggd_widget_last_sent)} $lastSentTime",
      maxLines = 1,
      style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, color = ColorProvider(AttentionAmber)),
    )
  }
}

@Composable
private fun LoggedOutBody(context: Context) {
  TitleRow()
  Spacer(modifier = GlanceModifier.height(8.dp))
  Text(
    text = context.getString(R.string.tryggd_widget_open_to_connect),
    maxLines = 3,
    style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, color = ColorProvider(TextMuted)),
  )
  Spacer(modifier = GlanceModifier.height(8.dp))
  ActionButtonPrimary(
    label = context.getString(R.string.tryggd_widget_open_tryggd),
    contentDescription = context.getString(R.string.tryggd_widget_open_tryggd),
    onClick = actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(CHECK_IN_URI))),
  )
}

// MARK: - Shared button styling
//
// CHECK IN / OPEN TRYGGD are the normal, everyday, calm actions — solid
// brand-green fill, visually primary. "Asked to Send Money" deliberately
// looks different (soft amber tint, not a loud solid block) so it stays
// easy to FIND without the widget reading as alarming at rest — the
// actual alert only ever fires from inside the app, deliberately (see the
// file header). Rounded corners are intentionally skipped here — Glance's
// corner-radius API has moved around between versions similarly to
// ColorProvider (see the import note above), so plain rectangular fills
// are used to avoid a version-specific compile risk; safe to layer
// GlanceModifier.cornerRadius()/RoundedCornerShape back in once verified
// against the pinned Glance version on a real build.

@Composable
private fun ActionButtonPrimary(label: String, contentDescription: String, onClick: Action) {
  Row(
    verticalAlignment = Alignment.Vertical.CenterVertically,
    horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
    modifier = GlanceModifier
      .fillMaxWidth()
      .background(CheckGreen)
      .padding(vertical = 10.dp, horizontal = 12.dp)
      .clickable(onClick)
      .semantics { this.contentDescription = contentDescription },
  ) {
    Text(
      text = label,
      maxLines = 1,
      style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ColorProvider(White)),
    )
  }
}

// ActionButtonSecondary (the old compact money button) is gone —
// BigMoneyAlertButton above replaces it. ActionButtonPrimary is kept only
// for LoggedOutBody's "Open Tryggd" button.
