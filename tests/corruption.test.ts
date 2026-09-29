import { test } from "node:test"
import assert from "node:assert/strict"
import { openMahim, parseMahimHeader } from "../src/reader/reader.js"
import { createMahimWriter } from "../src/writer/writer.js"
import { crc32c } from "../src/checksum/crc32c.js"
import {
  writeUint32LE,
  writeUint64LE,
  readUint32LE,
  bytesEqual,
} from "../src/format/primitives.js"
import {
  ChecksumMismatchError,
  FileDigestMismatchError,
  FileLengthMismatchError,
  HeaderChecksumError,
  InvalidSectionDirectoryError,
  MalformedHeaderError,
  MalformedSectionError,
  MahimError,
  ResourceLimitError,
  SectionBoundsError,
  SectionOverlapError,
  TruncatedFileError,
  UnsupportedCompressionError,
} from "../src/errors/index.js"
import { CompressionMethod, SectionType } from "../src/format/constants.js"

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

async function buildBase(): Promise<Uint8Array> {
  return createMahimWriter({ fileDigest: true })
    .setApplication({ identifier: "corrupt", payloadVersion: 1 })
    .addSection({
      type: SectionType.ApplicationPayload,
      name: "alpha",
      data: text("alpha payload content"),
    })
    .addSection({
      type: SectionType.Asset,
      name: "beta",
      compression: CompressionMethod.DeflateRaw,
      data: text("beta ".repeat(200)),
    })
    .finalize()
}

function fixHeaderChecksum(bytes: Uint8Array): void {
  const headerLength = readUint32LE(bytes, 8)
  const copy = bytes.slice(0, headerLength)
  writeUint32LE(copy, 46, 0)
  writeUint32LE(bytes, 46, crc32c(copy))
}

test("single flipped byte in a payload is detected", async () => {
  const bytes = await buildBase()
  const reader = await openMahim(bytes)
  const descriptor = reader.findSection("alpha")!
  const corrupted = bytes.slice()
  corrupted[descriptor.payloadOffset + 1] = corrupted[descriptor.payloadOffset + 1]! ^ 0x80
  await assert.rejects(
    (await openMahim(corrupted)).getSection("alpha"),
    ChecksumMismatchError,
  )
})

test("single flipped byte in the header is detected", async () => {
  const bytes = await buildBase()
  const corrupted = bytes.slice()
  corrupted[14] = corrupted[14]! ^ 0x01
  await assert.rejects(parseMahimHeader(corrupted), HeaderChecksumError)
})

test("flipped byte in the file digest is detected", async () => {
  const bytes = await buildBase()
  const corrupted = bytes.slice()
  corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0x01
  const report = await (await openMahim(corrupted)).verify()
  assert.equal(report.fileDigestValid, false)
  assert.equal(report.valid, false)
})

test("corrupted directory descriptor offsets fail safely", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  writeUint64LE(corrupted, header.sectionDirectoryOffset + 8, 0)
  await assert.rejects(openMahim(corrupted), SectionBoundsError)
})

test("corrupted section count is rejected", async () => {
  const bytes = await buildBase()
  const corrupted = bytes.slice()
  writeUint32LE(corrupted, 18, 0xffffffff)
  fixHeaderChecksum(corrupted)
  await assert.rejects(openMahim(corrupted), ResourceLimitError)
})

test("corrupted directory length is rejected", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  writeUint64LE(corrupted, 30, header.sectionDirectoryLength + 8)
  fixHeaderChecksum(corrupted)
  await assert.rejects(openMahim(corrupted), (error: unknown) => {
    return error instanceof InvalidSectionDirectoryError || error instanceof MalformedHeaderError
  })
})

test("truncated input at every prefix length fails safely", async () => {
  const bytes = await buildBase()
  for (let length = 0; length < bytes.length; length += 17) {
    const prefix = bytes.slice(0, length)
    try {
      await openMahim(prefix)
      assert.fail(`prefix length ${length} should not open`)
    } catch (error) {
      assert.ok(error instanceof MahimError, `prefix ${length}: ${String(error)}`)
    }
  }
})

test("appended garbage is rejected", async () => {
  const bytes = await buildBase()
  const extended = new Uint8Array(bytes.length + 3)
  extended.set(bytes)
  await assert.rejects(openMahim(extended), FileLengthMismatchError)
})

test("incorrect stored length fails bounds or checksum checks", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  writeUint64LE(corrupted, header.sectionDirectoryOffset + 16, 1)
  writeUint64LE(corrupted, header.sectionDirectoryOffset + 24, 1)
  const reader = await openMahim(corrupted)
  await assert.rejects(reader.getSection(0), (error: unknown) => {
    return error instanceof ChecksumMismatchError || error instanceof SectionBoundsError
  })
})

test("overlapping payload ranges are rejected", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  const secondDescriptor = header.sectionDirectoryOffset + 48 + 8
  const firstOffset = readUint32LE(bytes, header.sectionDirectoryOffset + 8)
  writeUint64LE(corrupted, secondDescriptor, firstOffset)
  fixHeaderChecksum(corrupted)
  await assert.rejects(openMahim(corrupted), (error: unknown) => {
    return error instanceof SectionOverlapError || error instanceof SectionBoundsError
  })
})

test("unsupported compression in a descriptor is rejected", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  corrupted[header.sectionDirectoryOffset + 37] = 200
  await assert.rejects(openMahim(corrupted), UnsupportedCompressionError)
})

test("decompression bomb metadata is limited", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  writeUint64LE(corrupted, header.sectionDirectoryOffset + 48 + 24, 64 * 1024 * 1024)
  await assert.rejects(
    openMahim(corrupted, { limits: { maxSectionUncompressedLength: 1024 * 1024 } }),
    ResourceLimitError,
  )
})

test("decompressed output larger than declared length is rejected", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  writeUint64LE(corrupted, header.sectionDirectoryOffset + 48 + 24, 16)
  const reader = await openMahim(corrupted)
  await assert.rejects(reader.getSection(1), MalformedSectionError)
})

test("compression ratio limits trigger resource errors", async () => {
  const bytes = await buildBase()
  const reader = await openMahim(bytes, {
    limits: { maxDecompressionRatio: 2 },
  })
  await assert.rejects(reader.getSection(1), ResourceLimitError)
})

test("invalid header flags are rejected", async () => {
  const bytes = await buildBase()
  const corrupted = bytes.slice()
  corrupted[7] = 0x40
  fixHeaderChecksum(corrupted)
  await assert.rejects(openMahim(corrupted), MahimError)
})

test("reserved header bytes are rejected", async () => {
  const bytes = await buildBase()
  const corrupted = bytes.slice()
  corrupted[52] = 0x01
  fixHeaderChecksum(corrupted)
  await assert.rejects(openMahim(corrupted), MahimError)
})

test("descriptor flag corruption is rejected", async () => {
  const bytes = await buildBase()
  const header = await parseMahimHeader(bytes)
  const corrupted = bytes.slice()
  corrupted[header.sectionDirectoryOffset + 38] = 0
  corrupted[header.sectionDirectoryOffset + 39] = 0
  await assert.rejects(openMahim(corrupted), InvalidSectionDirectoryError)
})

test("magic corruption never yields partial success", async () => {
  const bytes = await buildBase()
  for (const index of [0, 2, 4]) {
    const corrupted = bytes.slice()
    corrupted[index] = corrupted[index]! ^ 0xff
    await assert.rejects(openMahim(corrupted), MahimError)
    await assert.rejects(parseMahimHeader(corrupted), MahimError)
  }
})

test("valid base file sanity", async () => {
  const bytes = await buildBase()
  const reader = await openMahim(bytes)
  const report = await reader.verify()
  assert.equal(report.valid, true)
  assert.ok(bytesEqual(await reader.getSection("alpha"), text("alpha payload content")))
})
