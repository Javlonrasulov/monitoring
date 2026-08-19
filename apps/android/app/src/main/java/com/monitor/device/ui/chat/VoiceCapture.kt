package com.monitor.device.ui.chat

import android.media.MediaRecorder
import java.io.File

class VoiceCapture(private val output: File) {
    private var recorder: MediaRecorder? = null
    private var startedAt = 0L

    @Suppress("DEPRECATION")
    fun start() {
        val rec = MediaRecorder()
        rec.setAudioSource(MediaRecorder.AudioSource.MIC)
        rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        rec.setAudioEncodingBitRate(64_000)
        rec.setAudioSamplingRate(44_100)
        rec.setOutputFile(output.absolutePath)
        rec.prepare()
        rec.start()
        recorder = rec
        startedAt = System.currentTimeMillis()
    }

    fun elapsedMs(): Int = if (startedAt == 0L) 0 else (System.currentTimeMillis() - startedAt).toInt()

    fun stop(): Int {
        val duration = elapsedMs()
        runCatching {
            recorder?.stop()
            recorder?.release()
        }
        recorder = null
        return duration
    }

    fun cancel() {
        runCatching {
            recorder?.reset()
            recorder?.release()
        }
        recorder = null
        if (output.exists()) output.delete()
    }
}
