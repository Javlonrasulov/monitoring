# Testing checklist

Use against Samsung A51 and at least one other brand (Xiaomi/Redmi/Oppo/Vivo/Realme/Samsung).

## Functional

- [ ] Admin login works
- [ ] Pairing code created in Admin Web
- [ ] Android first-launch: welcome → permissions → pairing → device name
- [ ] Device appears under “Kuzatuv qurilmalari”
- [ ] ONLINE / OFFLINE updates without page refresh (Socket.IO)
- [ ] Battery %, charging, network type shown
- [ ] Live video (WHEP) plays
- [ ] Live audio works; mute/unmute on admin
- [ ] Stream quality LOW/MEDIUM/HIGH
- [ ] Snapshot saves and is listed
- [ ] Multiple devices concurrently
- [ ] Unauthorized / other-org stream blocked
- [ ] Device disable from admin

## Resilience

- [ ] Wi-Fi disconnect → CONNECTING → auto reconnect → STREAMING
- [ ] Mobile data works
- [ ] Screen off: stream continues when OS allows; else DEVICE_RESTRICTION
- [ ] App background: foreground notification “Monitoring active”
- [ ] Stop from notification stops monitoring
- [ ] App restart recovers paired session
- [ ] Device reboot: auto-start if enabled and OEM allows; else Admin shows OFFLINE
- [ ] Low battery / thermal: quality may drop
- [ ] Permission denied shows clear UI + settings path
- [ ] Camera unavailable / mic unavailable → ERROR with reason

## Hardening

- [ ] Start/Stop repeatedly does not leak camera sessions
- [ ] No duplicate WHIP sessions after reconnect
- [ ] 24h soak: memory stable
- [ ] No A51-hardcoded resolution/FPS/camera id
- [ ] Tenant isolation verified with two orgs
