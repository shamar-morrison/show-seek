package app.horizon.showseek

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class WidgetUpdateModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "WidgetUpdate"
    }

    @ReactMethod
    fun updateAllWidgets(promise: Promise) {
        try {
            val context = reactContext.applicationContext
            val appWidgetManager = AppWidgetManager.getInstance(context)

            // Update Upcoming Movies
            updateProvider(context, appWidgetManager, UpcomingMoviesWidgetProvider::class.java)
            
            // Update Upcoming TV
            updateProvider(context, appWidgetManager, UpcomingTVWidgetProvider::class.java)
            
            // Update Watchlist
            updateProvider(context, appWidgetManager, WatchlistWidgetProvider::class.java)

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_ERROR", e)
        }
    }

    private fun updateProvider(context: Context, appWidgetManager: AppWidgetManager, providerClass: Class<*>) {
        val componentName = ComponentName(context, providerClass)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)
        
        if (appWidgetIds != null && appWidgetIds.isNotEmpty()) {
            val intent = Intent(context, providerClass)
            intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, appWidgetIds)
            context.sendBroadcast(intent)
        }
    }
}
