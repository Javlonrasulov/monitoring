package com.monitor.device.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.monitor.device.core.api.DeviceApiClient
import okhttp3.OkHttpClient

@Composable
fun rememberAuthImageLoader(apiClient: DeviceApiClient): ImageLoader {
    val context = LocalContext.current
    return remember(apiClient) {
        ImageLoader.Builder(context)
            .okHttpClient {
                OkHttpClient.Builder()
                    .addInterceptor { chain ->
                        chain.proceed(
                            chain.request().newBuilder()
                                .header("Authorization", apiClient.authorizationHeader())
                                .build(),
                        )
                    }
                    .build()
            }
            .build()
    }
}

@Composable
fun UserAvatar(
    name: String,
    imageUrl: String?,
    imageLoader: ImageLoader,
    modifier: Modifier = Modifier,
    size: Dp = 52.dp,
    online: Boolean = false,
) {
    val context = LocalContext.current
    Box(modifier = modifier, contentAlignment = Alignment.BottomEnd) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                name.trim().take(1).uppercase().ifBlank { "?" },
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(imageUrl)
                        .crossfade(true)
                        .build(),
                    imageLoader = imageLoader,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(size).clip(CircleShape),
                )
            }
        }
        if (online) {
            Box(
                modifier = Modifier
                    .size((size.value * 0.23f).dp)
                    .clip(CircleShape)
                    .background(Color(0xFF2DD4BF)),
            )
        }
    }
}
