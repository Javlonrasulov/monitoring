"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCaptured: (file: File, meta: { durationMs: number; width: number; height: number }) => void;
  onError?: (message: string) => void;
};

export function VideoNoteCapture({ open, onClose, onCaptured, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 480, height: 480 },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        onError?.("Camera unavailable");
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onClose, onError]);

  function stop(emit: boolean) {
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    setSeconds(0);
    if (!rec) return;
    rec.onstop = () => {
      if (!emit) return;
      const blob = new Blob(chunksRef.current, {
        type: rec.mimeType || "video/webm",
      });
      const file = new File([blob], `note_${Date.now()}.webm`, {
        type: blob.type,
      });
      onCaptured(file, {
        durationMs: Math.max(500, Date.now() - startedAt.current),
        width: 480,
        height: 480,
      });
      onClose();
    };
    if (rec.state !== "inactive") rec.stop();
  }

  function start() {
    const stream = streamRef.current;
    if (!stream || recording) return;
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorderRef.current = rec;
    startedAt.current = Date.now();
    rec.start(200);
    setRecording(true);
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= 60) {
        window.clearInterval(id);
        stop(true);
      }
    }, 250);
  }

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal stack"
        style={{ alignItems: "center", maxWidth: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ width: "100%", justifyContent: "space-between" }}>
          <strong>Video note</strong>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="video-note-stage">
          <video ref={videoRef} muted playsInline />
        </div>
        <div className="muted">{recording ? `${seconds}s / 60s` : "Hold record up to 60s"}</div>
        <button
          type="button"
          className={`btn ${recording ? "btn-danger" : "btn-primary"}`}
          onMouseDown={start}
          onMouseUp={() => recording && stop(true)}
          onTouchStart={(e) => {
            e.preventDefault();
            start();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (recording) stop(true);
          }}
        >
          <Circle size={16} /> {recording ? "Recording…" : "Hold to record"}
        </button>
      </div>
    </div>
  );
}
