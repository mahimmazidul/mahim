import { readdirSync, readFileSync, statSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const distDir = join(root, "dist")

function listFiles(directory) {
  const out = []
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      out.push(...listFiles(full))
    } else if (entry.endsWith(".js")) {
      out.push(full)
    }
  }
  return out
}

let total = 0
let gzipTotal = 0
const rows = []
for (const file of listFiles(distDir)) {
  const source = readFileSync(file)
  const gzipped = gzipSync(source, { level: 9 })
  total += source.length
  gzipTotal += gzipped.length
  rows.push([relative(root, file), source.length, gzipped.length])
}

rows.sort((a, b) => b[1] - a[1])
console.log("file".padEnd(42), "raw".padStart(10), "gzip".padStart(10))
for (const [file, raw, gz] of rows) {
  console.log(file.padEnd(42), String(raw).padStart(10), String(gz).padStart(10))
}
console.log("-".repeat(64))
console.log("TOTAL (dist ESM, excluding source maps)".padEnd(42), String(total).padStart(10), String(gzipTotal).padStart(10))
console.log("")
console.log(`Approximate browser bundle size: ${(total / 1024).toFixed(1)} KiB raw, ${(gzipTotal / 1024).toFixed(1)} KiB gzip`)
console.log("Runtime dependencies: none (platform CompressionStream, TextDecoder, Blob only)")
