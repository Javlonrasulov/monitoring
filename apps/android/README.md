# Monitor — Android device app

Native Kotlin multi-module app that turns a phone into a transparent monitoring device for the Monitor platform.

## Modules

| Module | Type | Role |
|--------|------|------|
| `:app` | application | Jetpack Compose UI (welcome, permissions, pairing, home) |
| `:core` | Android library | API client, token storage, shared models |
| `:monitoring` | Android library | Camera, audio, WHIP stream stubs, foreground service, status, reconnect |

**ApplicationId:** `com.monitor.device`  
**minSdk / targetSdk / compileSdk:** 26 / 34 / 34  
**API base URL:** `monitor.apiBaseUrl` in `gradle.properties` (currently the production server). Both `:app` and `:core` read it, so there is one place to change.

## Open in Android Studio

1. Install [Android Studio](https://developer.android.com/studio) (Hedgehog or newer recommended) with Android SDK 34.
2. **File → Open** and select this folder: `apps/android` (the directory that contains `settings.gradle.kts`).
3. Let Gradle sync. If the wrapper JAR is missing, Android Studio will offer to generate it, or run from this folder:
   ```bash
   gradle wrapper --gradle-version 8.7
   ```
   (requires a local Gradle install once).
4. Create / start an Android emulator (API 26+) or connect a device with USB debugging.
5. Run the **app** configuration (green Run).

### Pointing the app at another backend

Override the base URL without touching code:

```bash
./gradlew :app:assembleDebug -Pmonitor.apiBaseUrl=http://10.0.2.2:3001/api/v1/
```

`10.0.2.2` is the emulator's route to the host machine; a physical phone needs a LAN IP or the public server URL.

## Transparency & privacy

- Camera / mic / notifications are requested explicitly in-app.
- Monitoring runs in a **foreground service** with notification title **“Monitoring active”** and actions **Stop** / **Open app**.
- No hidden background capture — the user can stop at any time.

## WHIP / MediaMTX

`WhipPublisher` publishes camera + microphone over WebRTC (Stream WebRTC, `org.webrtc`) to MediaMTX:

1. Builds a PeerConnection, attaches a camera capturer and an audio source.
2. Creates an offer and **waits for ICE gathering to complete** — the signaling is non-trickle, so the offer must already carry the candidates.
3. POSTs the SDP to `whipUrl`, resolves the returned `Location` into an absolute session URL, and DELETEs it on stop.
4. Marks itself inactive when ICE fails or disconnects, which makes `MonitoringEngine` republish with a fresh token.

MediaMTX only forwards **HTTP basic** credentials to its external auth endpoint, so the short-lived stream token is sent as the basic-auth password (`monitor:<token>`), not as a bearer header.

`CameraStreamController` (CameraX) is only used for the in-app preview; capture for streaming is owned by `WhipPublisher`.

## Pairing flow

1. Admin creates a pairing code in the web console.
2. Device app: Welcome → Permissions → enter code + device name → Pair.
3. Tokens are stored in EncryptedSharedPreferences via `TokenStore`.
4. Home → Start monitoring → heartbeat + publisher-token + local capture pipeline.

## Build from CLI (optional)

```bash
cd apps/android
./gradlew :app:assembleDebug
```

On Windows: `gradlew.bat :app:assembleDebug`

The APK lands in `app/build/outputs/apk/debug/app-debug.apk`.

## Install on a phone

The current build is published on the server, so a phone can install it directly:

```
http://89.39.95.41:8080/download/monitor.apk
```

Publish a new build with:

```bash
scp -i ~/.ssh/vm58627_rsa app/build/outputs/apk/debug/app-debug.apk \
  ubuntu@89.39.95.41:/opt/monitor/deploy/public/monitor.apk
```
