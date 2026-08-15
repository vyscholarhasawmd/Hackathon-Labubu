import { Injectable, NotFoundException } from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "./config";

@Injectable()
export class MediaStorageService {
  private readonly root = path.resolve(process.cwd(), appConfig().uploadDir);

  private resolveKey(storageKey: string): string {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(storageKey)) throw new NotFoundException("Image not found");
    const full=path.resolve(this.root,storageKey);
    if (!full.startsWith(`${this.root}${path.sep}`)) throw new NotFoundException("Image not found");
    return full;
  }

  async put(userId: string, scanId: string, jpeg: Buffer): Promise<string> {
    const storageKey=`${userId}/${scanId}.jpg`; const target=this.resolveKey(storageKey);
    await mkdir(path.dirname(target),{ recursive:true,mode:0o700 });
    await writeFile(target,jpeg,{ mode:0o600 });
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    try { return await readFile(this.resolveKey(storageKey)); }
    catch (error) { if ((error as {code?:string}).code === "ENOENT") throw new NotFoundException("Image not found"); throw error; }
  }

  async delete(storageKey: string): Promise<void> {
    try { await unlink(this.resolveKey(storageKey)); }
    catch (error) { if ((error as {code?:string}).code !== "ENOENT") throw error; }
  }
}

export function detectImageMime(buffer: Buffer): "image/jpeg"|"image/png"|"image/webp"|"image/heif"|null {
  if (buffer.length >= 3 && buffer[0]===0xff && buffer[1]===0xd8 && buffer[2]===0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii",0,4)==="RIFF" && buffer.toString("ascii",8,12)==="WEBP") return "image/webp";
  if (buffer.length >= 12 && buffer.toString("ascii",4,8)==="ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1|avif)$/.test(buffer.toString("ascii",8,12))) return "image/heif";
  return null;
}
