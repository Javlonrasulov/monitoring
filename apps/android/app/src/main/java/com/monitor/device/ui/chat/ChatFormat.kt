package com.monitor.device.ui.chat

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.webkit.MimeTypeMap
import com.monitor.device.R
import java.io.File
import java.io.FileOutputStream
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.min
import kotlin.math.roundToInt

fun formatFileSize(bytes: Long?): String {
    if (bytes == null || bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB")
    var value = bytes.toDouble()
    var unit = 0
    while (value >= 1024 && unit < units.lastIndex) {
        value /= 1024
        unit++
    }
    return if (unit == 0) "$bytes B" else String.format(Locale.US, "%.1f %s", value, units[unit])
}

fun formatDuration(ms: Int?): String {
    val total = ((ms ?: 0) / 1000).coerceAtLeast(0)
    val m = total / 60
    val s = total % 60
    return "%d:%02d".format(m, s)
}

/** Telegram-style mm:ss with a leading zero on minutes. */
fun formatVoiceClock(ms: Int?): String {
    val total = ((ms ?: 0) / 1000).coerceAtLeast(0)
    val m = total / 60
    val s = total % 60
    return "%02d:%02d".format(m, s)
}

fun defaultVoiceWaveform(seed: String): List<Float> {
    val hash = seed.hashCode()
    return List(52) { index ->
        val mixed = (hash * 1664525 + index * 1013904223)
        val unit = ((mixed ushr 8) and 0xFF) / 255f
        0.16f + unit * 0.84f
    }
}

fun formatClock(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val date = parseIso(iso) ?: return ""
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
}

fun formatDayLabel(context: Context, iso: String?): String {
    val date = parseIso(iso) ?: return ""
    val cal = Calendar.getInstance().apply { time = date }
    val today = Calendar.getInstance()
    val yesterday = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }
    return when {
        isSameDay(cal, today) -> context.getString(R.string.chat_today)
        isSameDay(cal, yesterday) -> context.getString(R.string.chat_yesterday)
        else -> DateFormat.getDateInstance(DateFormat.LONG).format(date)
    }
}

fun formatLastSeen(context: Context, iso: String?, online: Boolean, typing: Boolean): String {
    if (typing) return context.getString(R.string.chat_typing)
    if (online) return context.getString(R.string.chat_online)
    if (iso.isNullOrBlank()) return context.getString(R.string.chat_offline)
    val date = parseIso(iso) ?: return context.getString(R.string.chat_offline)
    val diff = System.currentTimeMillis() - date.time
    return if (diff < 15 * 60 * 1000) {
        context.getString(R.string.chat_last_seen_recently)
    } else {
        context.getString(R.string.chat_last_seen, DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(date))
    }
}

fun dayKey(iso: String?): String {
    val date = parseIso(iso) ?: return ""
    return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)
}

fun parseIso(iso: String?): Date? {
    if (iso.isNullOrBlank()) return null
    val normalized = iso.replace("Z", "+00:00")
    val patterns = arrayOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss",
    )
    for (pattern in patterns) {
        runCatching {
            return SimpleDateFormat(pattern, Locale.US).parse(normalized)
        }
    }
    return null
}

private fun isSameDay(a: Calendar, b: Calendar) =
    a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)

fun copyUriToCache(context: Context, uri: Uri, nameHint: String? = null): File {
    val name = nameHint ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file-${UUID.randomUUID()}"
    val dest = File(context.cacheDir, "chat-${UUID.randomUUID()}-$name")
    context.contentResolver.openInputStream(uri)?.use { input ->
        dest.outputStream().use { output -> input.copyTo(output) }
    } ?: error("Cannot read file")
    return dest
}

fun compressAvatar(context: Context, uri: Uri, size: Int = 640, quality: Int = 85): File {
    val original = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        ?: error("Cannot decode image")
    val side = min(original.width, original.height).coerceAtLeast(1)
    val x = (original.width - side) / 2
    val y = (original.height - side) / 2
    val cropped = Bitmap.createBitmap(original, x, y, side, side)
    val scaled = if (side > size) Bitmap.createScaledBitmap(cropped, size, size, true) else cropped
    val dest = File(context.cacheDir, "avatar-${UUID.randomUUID()}.jpg")
    FileOutputStream(dest).use { out ->
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
    }
    if (scaled !== cropped) scaled.recycle()
    if (cropped !== original) cropped.recycle()
    original.recycle()
    return dest
}

fun compressImage(context: Context, uri: Uri, maxSide: Int = 1600, quality: Int = 82): Pair<File, Pair<Int, Int>> {
    val original = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        ?: error("Cannot decode image")
    val scale = min(1f, maxSide.toFloat() / min(original.width, original.height).coerceAtLeast(1))
    val width = (original.width * scale).roundToInt().coerceAtLeast(1)
    val height = (original.height * scale).roundToInt().coerceAtLeast(1)
    val scaled = if (scale < 1f) Bitmap.createScaledBitmap(original, width, height, true) else original
    val dest = File(context.cacheDir, "chat-img-${UUID.randomUUID()}.jpg")
    FileOutputStream(dest).use { out ->
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
    }
    if (scaled !== original) scaled.recycle()
    original.recycle()
    return dest to (width to height)
}

fun videoThumbnail(context: Context, file: File): File? {
    return runCatching {
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(file.absolutePath)
        val bitmap = retriever.frameAtTime ?: retriever.getFrameAtTime(0)
        retriever.release()
        if (bitmap == null) return@runCatching null
        val dest = File(context.cacheDir, "chat-thumb-${UUID.randomUUID()}.jpg")
        FileOutputStream(dest).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 70, it) }
        bitmap.recycle()
        dest
    }.getOrNull()
}

fun videoDurationMs(file: File): Int {
    return runCatching {
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(file.absolutePath)
        val value = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toIntOrNull() ?: 0
        retriever.release()
        value
    }.getOrDefault(0)
}

fun mimeFor(context: Context, uri: Uri, fallback: String): String {
    return context.contentResolver.getType(uri)
        ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(
            MimeTypeMap.getFileExtensionFromUrl(uri.toString()),
        )
        ?: fallback
}

fun displayName(context: Context, uri: Uri, fallback: String): String {
    val cursor = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
    cursor?.use {
        if (it.moveToFirst()) {
            val name = it.getString(0)
            if (!name.isNullOrBlank()) return name
        }
    }
    return fallback
}
