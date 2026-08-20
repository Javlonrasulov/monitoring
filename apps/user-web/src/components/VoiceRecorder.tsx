"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  onRecorded: (file: File, meta: { durationMs: number; waveformJson: string }) => void;
  onError?: (message: string) => void;
};

export function VoiceRecorder({ disabled, onRecorded, onError }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const peaksRef = useRef<number[]>([]);
  const timerRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => stopInternal(false);
  }, []);

  function stopInternal(emit: boolean) {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const rec = mediaRef.current;
    mediaRef.current = null;
    if (rec && rec.state !== "inactive") {
      rec.onstop = () => {
        if (!emit) return;
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        const durationMs = Math.max(400, Date.now() - startedAt.current);
        const file = new File([blob], `voice_${Date.now()}.webm`, {
          type: blob.type,
        });
        const waveform = peaksRef.current.length
          ? peaksRef.current
          : Array.from({ length: 32 }, () => 0.2 + Math.random() * 0.5);
        onRecorded(file, {
          durationMs,
          waveformJson: JSON.stringify(waveform),
        });
      };
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    }
    setRecording(false);
    setSeconds(0);
  }

  async function start() {
    if (disabled || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;
      peaksRef.current = [];

      const sample = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        peaksRef.current.push(Math.min(1, avg * 1.6));
        if (peaksRef.current.length > 48) peaksRef.current.shift();
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mediaRef.current = rec;
      startedAt.current = Date.now();
      rec.start(200);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);
    } catch {
      onError?.("Microphone unavailable");
    }
  }

  return (
    <button
      type="button"
      className={`icon-btn ${recording ? "recording" : ""}`}
      disabled={disabled}
      aria-label={recording ? "Stop" : "Voice"}
      onMouseDown={() => void start()}
      onMouseUp={() => recording && stopInternal(true)}
      onMouseLeave={() => recording && stopInternal(true)}
      onTouchStart={(e) => {
        e.preventDefault();
        void start();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        if (recording) stopInternal(true);
      }}
      title={recording ? `${seconds}s` : "Hold to record"}
    >
      {recording ? <Square size={18} /> : <Mic size={18} />}
    </button>
  );
}
