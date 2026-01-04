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

class WatchlistWidgetProvider : AppWidgetProvider() {

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
        val layoutId = context.resources.getIdentifier("widget_watchlist", "layout", context.packageName)
        val views = RemoteViews(context.packageName, layoutId)

        // Load data from SharedPreferences
        val prefs = context.getSharedPreferences("showseek_widgets", Context.MODE_PRIVATE)
        val watchlistJson = prefs.getString("watchlist", null)
        
        // Read widget config for size
        val configJson = prefs.getString("widget_config", null)
        val size = configJson?.let { 
            try { JSONObject(it).optString("watchlist_size", "large") } catch (e: Exception) { "large" }
        } ?: "large"
        val maxItems = when(size) { "small" -> 1; "medium" -> 3; else -> 5 }
        
        // Parse watchlist data for listName and listId
        var listName = "My Watchlist"
        var listId = ""
        var items: JSONArray? = null
        
        if (watchlistJson != null) {
            try {
                val watchlistData = JSONObject(watchlistJson)
                listName = watchlistData.optString("listName", "My Watchlist")
                listId = watchlistData.optString("listId", "")
                items = watchlistData.optJSONArray("items")
            } catch (e: Exception) {
                // Fallback: treat as array for backwards compatibility
                try {
                    items = JSONArray(watchlistJson)
                } catch (e2: Exception) {
                    e2.printStackTrace()
                }
            }
        }
        
        // Set dynamic title
        val titleId = context.resources.getIdentifier("widget_title", "id", context.packageName)
        views.setTextViewText(titleId, listName)
        
        // Set click intent to open list detail screen
        val deepLink = if (listId.isNotEmpty()) {
            "showseek://library/custom-list/$listId"
        } else {
            "showseek://library"
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink))
        val pendingIntent = PendingIntent.getActivity(
            context, 
            0, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val containerId = context.resources.getIdentifier("widget_container", "id", context.packageName)
        views.setOnClickPendingIntent(containerId, pendingIntent)

        val itemsContainerId = context.resources.getIdentifier("items_container", "id", context.packageName)
        val emptyTextId = context.resources.getIdentifier("empty_text", "id", context.packageName)

        if (items != null && items.length() > 0) {
            val itemCount = minOf(items.length(), maxItems)
            
            views.setViewVisibility(itemsContainerId, View.VISIBLE)
            views.setViewVisibility(emptyTextId, View.GONE)

            val executor = Executors.newSingleThreadExecutor()
            executor.execute {
                try {
                    for (i in 0 until itemCount) {
                        val item = items.getJSONObject(i)
                        val title = item.optString("title", "")
                        val posterPath = item.optString("posterPath", "")
                        
                        val itemViewId = context.resources.getIdentifier("item_${i + 1}", "id", context.packageName)
                        val itemTitleId = context.resources.getIdentifier("title_${i + 1}", "id", context.packageName)
                        val posterId = context.resources.getIdentifier("poster_${i + 1}", "id", context.packageName)

                        views.setViewVisibility(itemViewId, View.VISIBLE)
                        views.setTextViewText(itemTitleId, title)

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
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
            executor.shutdown()
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
        for (i in 1..5) {
            val itemId = context.resources.getIdentifier("item_$i", "id", context.packageName)
            views.setViewVisibility(itemId, View.GONE)
        }
    }

    private fun loadBitmap(urlString: String): Bitmap? {
        var connection: HttpURLConnection? = null
        return try {
            val url = URL(urlString)
            connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 10000 // 10 seconds
            connection.readTimeout = 10000 // 10 seconds
            connection.doInput = true
            connection.connect()
            connection.inputStream.use { input ->
                BitmapFactory.decodeStream(input)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            connection?.disconnect()
        }
    }
}
