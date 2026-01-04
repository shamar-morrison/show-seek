package app.horizon.showseek

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SharedDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SharedPreferences"
    }

    @ReactMethod
    fun setString(prefsName: String, key: String, value: String, promise: Promise) {
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            val editor = sharedPref.edit()
            editor.putString(key, value)
            editor.apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e)
        }
    }

    @ReactMethod
    fun getString(prefsName: String, key: String, promise: Promise) {
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            val value = sharedPref.getString(key, null)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("READ_ERROR", e)
        }
    }
}
