import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { crc32 } from 'zlib';
import type { Writable } from 'stream';

type ZipEntry = {
  diskPath: string;
  name: string;
};

function u16(value: number) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value, 0);
  return buf;
}

function u32(value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear() - 1980, 0);
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate =
    (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

/**
 * Streams a ZIP (store-only, no RAM buffering of file contents).
 */
export async function streamStoreZip(
  files: ZipEntry[],
  out: Writable,
): Promise<void> {
  const central: Buffer[] = [];
  let offset = 0;

  const write = async (chunk: Buffer) => {
    offset += chunk.length;
    if (!out.write(chunk)) {
      await new Promise<void>((resolve) => out.once('drain', resolve));
    }
  };

  for (const file of files) {
    const info = await stat(file.diskPath);
    const name = file.name.replace(/\\/g, '/');
    const nameBuf = Buffer.from(name, 'utf8');
    const { dosTime, dosDate } = dosDateTime(info.mtime);
    let crc = 0;
    const size = Number(info.size);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0008),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(0),
      u32(0),
      u32(0),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
    ]);
    const localOffset = offset;
    await write(localHeader);

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(file.diskPath);
      stream.on('data', (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        crc = crc32(buf, crc);
        if (!out.write(buf)) {
          stream.pause();
          out.once('drain', () => stream.resume());
        }
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    offset += size;

    const descriptor = Buffer.concat([
      u32(0x08074b50),
      u32(crc >>> 0),
      u32(size),
      u32(size),
    ]);
    await write(descriptor);

    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0008),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(crc >>> 0),
        u32(size),
        u32(size),
        u16(nameBuf.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(localOffset),
        nameBuf,
      ]),
    );
  }

  const centralStart = offset;
  for (const row of central) {
    await write(row);
  }
  const centralSize = offset - centralStart;
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralSize),
    u32(centralStart),
    u16(0),
  ]);
  await write(eocd);
}
