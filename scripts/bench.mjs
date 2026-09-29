import { performance } from "node:perf_hooks"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  CompressionMethod,
  SectionType,
  createMahimWriter,
  encodeCbor,
  openMahim,
  parseMahimHeader,
} from "../dist/index.js"

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function text(value) {
  return new TextEncoder().encode(value)
}

function randomBytes(length, seed) {
  const bytes = new Uint8Array(length)
  let state = seed >>> 0 || 1
  for (let i = 0; i < length; i += 1) {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    bytes[i] = state & 0xff
  }
  return bytes
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function measure(name, iterations, fn) {
  const samples = []
  return (async () => {
    for (let i = 0; i < iterations; i += 1) {
      const start = performance.now()
      await fn()
      samples.push(performance.now() - start)
    }
    const result = { name, iterations, medianMs: median(samples), minMs: Math.min(...samples), maxMs: Math.max(...samples) }
    results.push(result)
    return result
  })()
}

const results = []

async function benchWrite(name, iterations, sections, options) {
  return measure(`write ${name}`, iterations, async () => {
    const writer = createMahimWriter(options)
    writer.setApplication({ identifier: "bench", payloadVersion: 1 })
    for (const section of sections) {
      writer.addSection(section)
    }
    await writer.finalize()
  })
}

async function benchRead(name, iterations, bytes) {
  return measure(`open+list ${name}`, iterations, async () => {
    await openMahim(bytes)
  })
}

const smallSections = [
  { type: SectionType.Metadata, name: "meta", data: encodeCbor({ name: "bench" }) },
  { type: SectionType.ApplicationPayload, name: "payload", data: text("small payload") },
]
const smallBytes = await (async () => {
  const writer = createMahimWriter().setApplication({ identifier: "bench", payloadVersion: 1 })
  for (const section of smallSections) {
    writer.addSection(section)
  }
  return writer.finalize()
})()

await benchWrite("small metadata file", 200, smallSections)
await benchRead("small metadata file", 200, smallBytes)
await measure("parse header small file", 200, async () => {
  await parseMahimHeader(smallBytes)
})

const asset10 = randomBytes(10 * 1024 * 1024, 11)
const asset100 = randomBytes(100 * 1024 * 1024, 22)
const textLike = text("the quick brown fox ".repeat(500000))

const bytes10 = await (async () => {
  const writer = createMahimWriter().setApplication({ identifier: "bench", payloadVersion: 1 })
  writer.addSection({ type: SectionType.Asset, name: "asset", data: asset10 })
  return writer.finalize()
})()
const bytes100 = await (async () => {
  const writer = createMahimWriter().setApplication({ identifier: "bench", payloadVersion: 1 })
  writer.addSection({ type: SectionType.Asset, name: "asset", data: asset100 })
  return writer.finalize()
})()
const bytesCompressed = await (async () => {
  const writer = createMahimWriter().setApplication({ identifier: "bench", payloadVersion: 1 })
  writer.addSection({
    type: SectionType.Asset,
    name: "text",
    compression: CompressionMethod.DeflateRaw,
    data: textLike,
  })
  return writer.finalize()
})()

await benchWrite("10 MB binary asset", 5, [{ type: SectionType.Asset, name: "asset", data: asset10 }])
await benchRead("10 MB binary asset", 20, bytes10)
await measure("single-section access 10 MB (full read+checksum)", 20, async () => {
  const reader = await openMahim(bytes10)
  await reader.getSection(0)
})

await benchWrite("100 MB binary asset", 3, [{ type: SectionType.Asset, name: "asset", data: asset100 }])
await benchRead("100 MB binary asset", 10, bytes100)
await measure("single-section access 100 MB (full read+checksum)", 5, async () => {
  const reader = await openMahim(bytes100)
  await reader.getSection(0)
})

await benchWrite("10 MB text asset (deflate_raw)", 3, [
  {
    type: SectionType.Asset,
    name: "text",
    compression: CompressionMethod.DeflateRaw,
    data: textLike,
  },
])
await benchRead("compressed 10 MB text", 10, bytesCompressed)
await measure("compressed section read (checksum+inflate)", 10, async () => {
  const reader = await openMahim(bytesCompressed)
  await reader.getSection(0)
})

const manySections = []
for (let i = 0; i < 1000; i += 1) {
  manySections.push({ type: SectionType.ApplicationPayload, name: `s${i}`, data: text(`payload ${i}`) })
}
await benchWrite("1000 small sections", 10, manySections)
const manyBytes = await (async () => {
  const writer = createMahimWriter().setApplication({ identifier: "bench", payloadVersion: 1 })
  for (const section of manySections) {
    writer.addSection(section)
  }
  return writer.finalize()
})()
await benchRead("1000 small sections", 50, manyBytes)
await measure("verify 10 MB file (checksums only)", 10, async () => {
  const reader = await openMahim(bytes10)
  await reader.verify({ decompress: false })
})

const report = results.map((result) => {
  const line = `${result.name}: median ${result.medianMs.toFixed(2)} ms (min ${result.minMs.toFixed(2)} ms, max ${result.maxMs.toFixed(2)} ms, n=${result.iterations})`
  return line
})

const output = [
  "# MAHIM benchmarks",
  "",
  "Environment: Node.js " + process.version + ", " + process.platform + " " + process.arch,
  "",
  "Measured with `npm run bench` (median of repeated runs).",
  "",
  ...report.map((line) => `- ${line}`),
  "",
  "Notes:",
  "- Write timings include compression and checksum computation.",
  "- Read timings (`open+list`) cover header and directory parsing only.",
  "- Single-section access reads and checksums only the selected section.",
  "- DEFLATE timings depend on the platform compression implementation.",
  "",
].join("\n")

mkdirSync(join(root, "docs"), { recursive: true })
writeFileSync(join(root, "docs", "benchmarks.md"), output)
console.log(output)
