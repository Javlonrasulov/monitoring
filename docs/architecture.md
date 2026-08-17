# Architecture

## Components

1. **Android Device App (Monitor)** — pairs via code, captures camera/mic, publishes WebRTC via WHIP, heartbeats status.
2. **NestJS API** — auth, multi-tenant org/branch, devices, stream tokens, snapshots, audit, Socket.IO events.
3. **MediaMTX** — media plane; devices publish, admins play (WHEP). Auth webhook → API.
4. **Admin Web** — device cards, pairing codes, live viewer, snapshot, realtime status.

## Data model (tenant)

```
Organization → Branch → Device
                 ↘ User (ADMIN/VIEWER)
```

All admin queries and stream tokens are scoped by `organizationId`.

## Stream security

1. Device requests publisher token (`POST /streaming/publisher-token`) with device JWT.
2. Admin requests viewer token (`POST /streaming/devices/:id/viewer-token`) with admin JWT.
3. MediaMTX calls `POST /streaming/mediamtx-auth` before publish/read.
4. Tokens are short-lived (`STREAM_TOKEN_TTL_SECONDS`).

## Realtime events (Socket.IO `/realtime`)

- `device.online` / `device.offline`
- `device.status` / `device.battery` / `device.network`
- `device.streaming` / `device.error`

## Android monitoring module

```
monitoring/
  camera/       capability probe + CameraX preview helpers
  audio/        AudioRecord helpers
  stream/       WhipPublisher (WebRTC), quality presets, adaptive bitrate
  service/      ForegroundService + notification actions
  status/       battery / network / thermal
  reconnect/    exponential backoff
  restriction/  OEM / screen-off DEVICE_RESTRICTION
  boot/         BOOT_COMPLETED auto-start (opt-in, OS limits apply)
```

## Recording readiness

`StreamSession` stores start/end/status for future continuous/motion/scheduled recording. Motion detection is not implemented in MVP.
