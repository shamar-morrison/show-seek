package app.horizon.showseek

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class UpcomingTVWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val layoutId = context.resources.getIdentifier("widget_upcoming_tv", "layout", context.packageName)
        val views = RemoteViews(context.packageName, layoutId)
        
        // Set click intent to open app
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("showseek://home"))
        val pendingIntent = PendingIntent.getActivity(
            context, 
            0, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val containerId = context.resources.getIdentifier("widget_container", "id", context.packageName)
        views.setOnClickPendingIntent(containerId, pendingIntent)

        // Load data from SharedPreferences
        val prefs = context.getSharedPreferences("showseek_widgets", Context.MODE_PRIVATE)
        val showsJson = prefs.getString("upcoming_tv", null)
        
        // Read widget config for size
        val configJson = prefs.getString("widget_config", null)
        val size = configJson?.let { 
            try { JSONObject(it).optString("upcoming_tv_size", "large") } catch (e: Exception) { "large" }
        } ?: "large"
        val maxItems = when(size) { "small" -> 1; "medium" -> 3; else -> 5 }

        val itemsContainerId = context.resources.getIdentifier("items_container", "id", context.packageName)
        val emptyTextId = context.resources.getIdentifier("empty_text", "id", context.packageName)

        if (showsJson != null) {
            try {
                val shows = JSONArray(showsJson)
                val itemCount = minOf(shows.length(), maxItems)

                if (itemCount > 0) {
                    views.setViewVisibility(itemsContainerId, View.VISIBLE)
                    views.setViewVisibility(emptyTextId, View.GONE)

                    val executor = Executors.newSingleThreadExecutor()
                    executor.execute {
                        for (i in 0 until itemCount) {
                            val show = shows.getJSONObject(i)
                            val title = show.optString("title", "")
                            val posterPath = show.optString("posterPath", "")
                            
                            val itemId = context.resources.getIdentifier("item_${i + 1}", "id", context.packageName)
                            val titleId = context.resources.getIdentifier("title_${i + 1}", "id", context.packageName)
                            val posterId = context.resources.getIdentifier("poster_${i + 1}", "id", context.packageName)

                            views.setViewVisibility(itemId, View.VISIBLE)
                            views.setTextViewText(titleId, title)

                            if (posterPath.isNotEmpty()) {
                                try {
                                    val imageUrl = "https://image.tmdb.org/t/p/w185$posterPath"
                                    val bitmap = loadBitmap(imageUrl)
                                    if (bitmap != null) {
                                        views.setImageViewBitmap(posterId, bitmap)
                                    }
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }
                        }
                        appWidgetManager.updateAppWidget(appWidgetId, views)
                    }
                } else {
                    showEmptyState(context, views)
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                showEmptyState(context, views)
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        } else {
            showEmptyState(context, views)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    private fun showEmptyState(context: Context, views: RemoteViews) {
        val itemsContainerId = context.resources.getIdentifier("items_container", "id", context.packageName)
        val emptyTextId = context.resources.getIdentifier("empty_text", "id", context.packageName)
        views.setViewVisibility(itemsContainerId, View.GONE)
        views.setViewVisibility(emptyTextId, View.VISIBLE)
        for (i in 1..3) {
            val itemId = context.resources.getIdentifier("item_$i", "id", context.packageName)
            views.setViewVisibility(itemId, View.GONE)
        }
    }

    private fun loadBitmap(urlString: String): Bitmap? {
        return try {
            val url = URL(urlString)
            val connection = url.openConnection() as HttpURLConnection
            connection.doInput = true
            connection.connect()
            val input = connection.inputStream
            BitmapFactory.decodeStream(input)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
