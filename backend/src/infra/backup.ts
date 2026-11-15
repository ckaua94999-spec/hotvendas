import { readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export function backupExpired(mtimeMs: number, nowMs: number) {
  return nowMs - mtimeMs > RETENTION_MS
}

export async function pruneBackups(directory: string, nowMs = Date.now()) {
  const names = await readdir(directory).catch(() => [])
  for (const name of names) {
    if (!name.endsWith('.sql')) continue
    const path = join(directory, name)
    const info = await stat(path)
    if (backupExpired(info.mtimeMs, nowMs)) await unlink(path)
  }
}
