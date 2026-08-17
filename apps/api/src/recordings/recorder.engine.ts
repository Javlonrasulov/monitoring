import { ChildProcess, spawn } from 'child_process';
import { mkdir, stat, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { Logger } from '@nestjs/common';

export type RecorderQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export function spawnSegmentRecorder(opts: {
  ffmpegPath: string;
  rtspUrl: string;
  outputPath: string;
  quality: RecorderQuality;
  durationSec: number;
}): ChildProcess {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-rtsp_transport',
    'tcp',
    '-timeout',
    '15000000',
    '-fflags',
    '+genpts',
    '-i',
    opts.rtspUrl,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-t',
    String(opts.durationSec),
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
