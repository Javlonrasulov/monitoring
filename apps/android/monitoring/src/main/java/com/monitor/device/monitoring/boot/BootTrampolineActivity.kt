package com.monitor.device.monitoring.boot

import android.app.Activity
import android.os.Bundle
import android.util.Log
import com.monitor.device.monitoring.service.MonitoringForegroundService

/**
 * Brief invisible Activity after reboot so Android grants while-in-use camera/mic
 * access and allows starting the camera foreground service. Finishes immediately.
 */
class BootTrampolineActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i(TAG, "Boot trampoline: ensuring monitoring")
        MonitoringForegroundService.ensureStarted(applicationContext)
        finish()
    }

    companion object {
        private const val TAG = "BootTrampoline"
    }
}
