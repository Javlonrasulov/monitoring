# Monitor

Android monitoring device app + NestJS backend + MediaMTX + Next.js Admin Web.

## Architecture

```
Android Monitor App  --WHIP-->  MediaMTX  <--WHEP--  Admin Web / User Web
         |                         ^
         +------- REST/Socket ---- API (NestJS)
User Web (browser) -- same device JWT / chat / subscription APIs -->
```

See [docs/architecture.md](docs/architecture.md) and [docs/testing-checklist.md](docs/testing-checklist.md).

## Stack

| Part | Tech |
|------|------|
| Device app | Kotlin, Compose, CameraX (probe), WebRTC WHIP, Foreground Service |
| API | NestJS, Prisma, PostgreSQL, Socket.IO, JWT |
| Media | MediaMTX (WHIP publish / WHEP play) |
| Admin | Next.js 15, TypeScript, Tailwind |
| User Web | Next.js 15 — `app.levelapp.site` / `m.levelapp.site` |

## Quick start

### 1. Infrastructure

Requires Docker for Postgres, Redis, MediaMTX:

```bash
npm run docker:up
```

If Docker is unavailable, run Postgres 16 + Redis 7 + MediaMTX locally and match `apps/api/.env`.

### 2. API

```bash
cd apps/api
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

- API: http://localhost:3001/api/v1  
- Swagger: http://localhost:3001/api/docs  
- Seed admin: `admin@monitor.local` / `admin123`

### 3. Admin Web

```bash
cd apps/admin-web
npm install
npm run dev
```

Open http://localhost:3000 — login with seed credentials.

### 4. User Web (browser — same account as Android)

```bash
cd apps/user-web
npm install
npm run dev
```

Open http://localhost:3002 — phone + PIN (same as Android pairing).

Production hosts: `https://app.levelapp.site` and `https://m.levelapp.site`.

### 5. Android

Open `apps/android` in Android Studio, sync Gradle, run on device/emulator.

Emulator API base URL defaults to `http://10.0.2.2:3001/api/v1/`.

## Modules

- `apps/api` — backend
- `apps/admin-web` — admin panel (“Kuzatuv qurilmalari”)
- `apps/user-web` — end-user web (chats, devices, subscription)
- `apps/android` — Monitor device app (`:app`, `:core`, `:monitoring`)
- `packages/shared` — shared TS enums/types
- `docker/` — compose + MediaMTX config

## Security notes

- Streams are not public; short-lived tokens + tenant isolation
- Device auth uses pairing code → device JWT (client `deviceId` alone is not trusted)
- Monitoring uses a visible foreground notification: “Monitoring active”
- No permission / privacy bypass
