import { ChildProcess, spawn } from 'child_process';
import { mkdir, stat, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { Logger } from '@nestjs/common';

export type RecorderQuality = 'LOW' | 'MEDIUM' | 'HIGH';

const QUALITY: Record<
  RecorderQuality,
  { width: number; videoBitrate: string; bufsize: string }
> = {
  LOW: { width: 640, videoBitrate: '400k', bufsize: '800k' },
  MEDIUM: { width: 854, videoBitrate: '800k', bufsize: '1600k' },
  HIGH: { width: 1280, videoBitrate: '1200k', bufsize: '2400k' },
};

export function spawnSegmentRecorder(opts: {
  ffmpegPath: string;
  rtspUrl: string;
  outputPath: string;
  quality: RecorderQuality;
  durationSec: number;
}): ChildProcess {
  const preset = QUALITY[opts.quality] ?? QUALITY.MEDIUM;
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-rtsp_transport',
    'tcp',
    '-timeout',
    '15000000',
    '-i',
    opts.rtspUrl,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    `scale=${preset.width}:-2`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-profile:v',
    'baseline',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    preset.videoBitrate,
    '-maxrate',
    preset.videoBitrate,
    '-bufsize',
    preset.bufsize,
    '-g',
    '48',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-t',
    String(opts.durationSec),
    '-movflags',
    '+frag_keyframe+empty_moov+default_base_moov',
    '-threads',
    '1',
    '-y',
    opts.outputPath,
  ];
  return spawn(opts.ffmpegPath, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

export async function ensureParentDir(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function fileSizeOrZero(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.size;
  } catch {
    return 0;
  }
}

export async function removeIfExists(filePath: string) {
  try {
    await unlink(filePath);
  } catch {
    // already gone
  }
}

export function recordingsRootJoin(root: string, storagePath: string) {
  return join(root, storagePath);
}

export const recorderLogger = new Logger('RecorderEngine');
