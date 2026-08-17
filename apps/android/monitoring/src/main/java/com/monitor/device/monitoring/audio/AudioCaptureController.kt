package com.monitor.device.monitoring.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Microphone capture via AudioRecord. Supports start / stop / mute.
 */
class AudioCaptureController(
    private val context: Context,
) {
    private val running = AtomicBoolean(false)
    private val muted = AtomicBoolean(false)
    private var audioRecord: AudioRecord? = null
    private var captureThread: Thread? = null

    var onPcmFrame: ((ByteArray, Int) -> Unit)? = null

    fun start(sampleRate: Int = DEFAULT_SAMPLE_RATE) {
        if (!running.compareAndSet(false, true)) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            running.set(false)
            throw SecurityException("RECORD_AUDIO permission not granted")
        }

        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) {
            running.set(false)
            throw IllegalStateException("Unsupported audio configuration")
        }

        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            minBuffer * 2,
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            running.set(false)
            throw IllegalStateException("AudioRecord failed to initialize")
        }

        audioRecord = record
        record.startRecording()
        captureThread = thread(name = "AudioCapture", isDaemon = true) {
            val buffer = ByteArray(minBuffer)
            while (running.get()) {
                val read = record.read(buffer, 0, buffer.size)
                if (read > 0 && !muted.get()) {
                    // TODO(MediaMTX WHIP): feed PCM into WebRTC AudioTrack / Opus encoder
                    onPcmFrame?.invoke(buffer.copyOf(read), read)
                }
            }
        }
        Log.i(TAG, "Audio capture started @ ${sampleRate}Hz")
    }

    fun setMuted(value: Boolean) {
        muted.set(value)
    }

    fun isMuted(): Boolean = muted.get()

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        runCatching { audioRecord?.stop() }
        runCatching { audioRecord?.release() }
        audioRecord = null
        captureThread = null
        Log.i(TAG, "Audio capture stopped")
    }

    companion object {
        private const val TAG = "AudioCaptureController"
        const val DEFAULT_SAMPLE_RATE = 48_000
    }
}
