// modules/tryggd-widget-bridge/android/src/main/java/expo/modules/tryggdwidgetbridge/TryggdWidgetBridgeModule.kt
//
// Writes the widget snapshot JSON into SharedPreferences and asks the
// widget's AppWidgetProvider (a GlanceAppWidgetReceiver, added by the
// config plugin at plugins/withAndroidWidget.js into the main `app`
// module) to update.
//
// Unlike iOS, an Android home screen widget runs inside the *same app
// process* as the rest of the app (it's not a separate extension) — so
// there's no App-Group-style shared container here, just a normal
// SharedPreferences file that both this module and the widget's Glance
// code read/write.
//
// This module is a Gradle *library* module; the actual widget receiver
// class lives in the `app` module (added by the config plugin), and a
// library module cannot have a compile-time dependency on the app that
// depends on it. So the receiver is targeted by its fully-qualified class
// name (a string) via an explicit Intent, rather than a direct class
// reference — see `widgetReceiverClassName` below. If that class is ever
// renamed/moved, update the string here to match.
package expo.modules.tryggdwidgetbridge

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val PREFS_NAME = "tryggd_widget_prefs"
private const val SNAPSHOT_KEY = "widget_snapshot_json"

/** Must match the receiver registered by plugins/withAndroidWidget.js in
 * the AndroidManifest.xml (android/app), and the class defined at
 * android/widget/src/main/java/.../TryggdWidgetReceiver.kt. */
private const val WIDGET_RECEIVER_CLASS_NAME =
  "com.marcustechnology.tryggd.widget.TryggdWidgetReceiver"

class TryggdWidgetBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TryggdWidgetBridge")

    // NOTE: deliberately using `if (context != null) { ... }` rather than
    // `val context = appContext.reactContext ?: return@Function` here —
    // the early-return idiom compiles fine for setSnapshot's ONE-argument
    // overload of Function(), but fails on a real build for clearSnapshot's
    // ZERO-argument overload with "Return type mismatch: expected 'Any?',
    // actual 'Unit'" — an Expo Modules Kotlin DSL overload-inference quirk,
    // not a logic bug. The `if` guard sidesteps it for both, so both
    // functions use the same shape rather than two different idioms.
    Function("setSnapshot") { json: String ->
      val context = appContext.reactContext
      if (context != null) {
        context
          .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putString(SNAPSHOT_KEY, json)
          .apply()
        requestWidgetUpdate(context)
      }
    }

    Function("clearSnapshot") {
      val context = appContext.reactContext
      if (context != null) {
        context
          .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .remove(SNAPSHOT_KEY)
          .apply()
        requestWidgetUpdate(context)
      }
    }
  }

  private fun requestWidgetUpdate(context: Context) {
    try {
      val receiverComponent = ComponentName(context, WIDGET_RECEIVER_CLASS_NAME)
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val ids = appWidgetManager.getAppWidgetIds(receiverComponent)
      if (ids.isEmpty()) return // no widget instances placed — nothing to refresh

      val updateIntent = Intent(context, Class.forName(WIDGET_RECEIVER_CLASS_NAME)).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
      }
      context.sendBroadcast(updateIntent)
    } catch (error: ClassNotFoundException) {
      // The widget module hasn't been added to this build yet (e.g. before
      // running the Android widget config plugin / a fresh prebuild) —
      // the snapshot write above still succeeded, so once the widget is
      // added it'll pick up the latest value on its own next update cycle.
      println("[TryggdWidgetBridge] Widget receiver not found ($WIDGET_RECEIVER_CLASS_NAME) — skipping refresh request.")
    }
  }
}
