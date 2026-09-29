import { readFile, writeFile } from "node:fs/promises"
import { openMahim, parseMahimHeader, type MahimReader } from "../reader/reader.js"
import type { MahimHeader } from "../format/header.js"
import type { OpenOptions } from "../reader/reader.js"

export async function readMahimFile(
  path: string,
  options?: OpenOptions,
): Promise<MahimReader> {
  const bytes = new Uint8Array(await readFile(path))
  return openMahim(bytes, options)
}

export async function parseMahimFileHeader(path: string): Promise<MahimHeader> {
  const bytes = new Uint8Array(await readFile(path))
  return parseMahimHeader(bytes)
}

export async function writeMahimFile(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes)
}
