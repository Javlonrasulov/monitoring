package com.monitor.device.ui.screens

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.monitor.device.R
import com.monitor.device.ui.theme.MonitorTheme
import com.monitor.device.ui.theme.Spacing
import java.util.concurrent.atomic.AtomicReference

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PaymentCheckoutSheet(
    url: String,
    payAddress: String,
    onClose: () -> Unit,
) {
    val colors = MonitorTheme.colors
    var webView by remember { mutableStateOf<WebView?>(null) }
    val fileCallback = remember { AtomicReference<ValueCallback<Array<Uri>>?>(null) }
    val pickFiles = rememberLauncherForActivityResult(
        ActivityResultContracts.GetMultipleContents(),
    ) { uris ->
        val cb = fileCallback.getAndSet(null) ?: return@rememberLauncherForActivityResult
        if (uris.isEmpty()) cb.onReceiveValue(null) else cb.onReceiveValue(uris.toTypedArray())
    }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false),
    ) {
        BackHandler {
            val view = webView
            if (view?.canGoBack() == true) view.goBack() else onClose()
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.surfaceElevated),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.settings_pay_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onClose) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.settings_pay_close),
                        tint = colors.textPrimary,
                    )
                }
            }
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.javaScriptCanOpenWindowsAutomatically = true
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                        settings.userAgentString =
                            "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
                        CookieManager.getInstance().setAcceptCookie(true)
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean {
                                val next = request.url
                                val scheme = next.scheme?.lowercase().orEmpty()
                                if (scheme == "http" || scheme == "https") {
                                    view.loadUrl(next.toString())
                                    return true
                                }
                                return false
                            }

                            override fun onPageFinished(view: WebView, loaded: String) {
                                if (payAddress.isBlank()) return
                                val escaped = payAddress.replace("\\", "\\\\").replace("'", "\\'")
                                view.evaluateJavascript(
                                    """
                                    (function() {
                                      var addr = '$escaped';
                                      var nodes = document.querySelectorAll('input, textarea');
                                      for (var i = 0; i < nodes.length; i++) {
                                        var el = nodes[i];
                                        var name = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '')).toLowerCase();
                                        if (name.indexOf('address') >= 0 || name.indexOf('wallet') >= 0 || name.indexOf('адрес') >= 0) {
                                          el.value = addr;
                                          el.dispatchEvent(new Event('input', { bubbles: true }));
                                          el.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                      }
                                    })();
                                    """.trimIndent(),
                                    null,
                                )
                            }
                        }
                        webChromeClient = object : WebChromeClient() {
                            override fun onShowFileChooser(
                                view: WebView?,
                                callback: ValueCallback<Array<Uri>>?,
                                params: FileChooserParams?,
                            ): Boolean {
                                fileCallback.getAndSet(null)?.onReceiveValue(null)
                                fileCallback.set(callback)
                                pickFiles.launch("image/*")
                                return true
                            }
                        }
                        loadUrl(url)
                        webView = this
                    }
                },
                update = { webView = it },
            )
        }
    }
}
