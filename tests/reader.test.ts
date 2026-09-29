import { test } from "node:test"
import assert from "node:assert/strict"
import { createMahimWriter } from "../src/writer/writer.js"
import { openMahim, parseMahimHeader } from "../src/reader/reader.js"
import {
  CompressionMethod,
  PayloadEncoding,
  SectionType,
} from "../src/format/constants.js"
import { encodeCbor, decodeCbor } from "../src/encoding/cbor.js"
import {
  ChecksumMismatchError,
  InvalidApplicationIdentifierError,
  InvalidSectionDirectoryError,
  MalformedUtf8Error,
  SectionNotFoundError,
  UnsupportedCompressionError,
  UnsupportedEncodingError,
} from "../src/errors/index.js"

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function buildFile(): Promise<Uint8Array> {
  return createMahimWriter()
    .setApplication({ identifier: "demo", payloadVersion: 2 })
    .addSection({
      type: SectionType.Metadata,
      name: "meta",
      data: encodeCbor({ note: "hello" }),
    })
    .addSection({
      type: SectionType.ApplicationPayload,
      name: "payload",
      version: 3,
      applicationDefinedId: 42,
      data: text("application payload bytes"),
    })
    .addSection({
      type: SectionType.Asset,
      name: "asset",
      compression: CompressionMethod.DeflateRaw,
      data: text("compress me ".repeat(100)),
    })
    .finalize()
}

test("writer and reader round trip", async () => {
  const bytes = await buildFile()
  const reader = await openMahim(bytes)
  assert.equal(reader.applicationIdentifier, "demo")
  assert.equal(reader.header.applicationPayloadVersion, 2)
  assert.equal(reader.formatVersion.major, 1)
  const sections = reader.listSections()
  assert.equal(sections.length, 3)
  assert.deepEqual(
    sections.map((section) => section.name),
    ["meta", "payload", "asset"],
  )
  const payload = await reader.getSection("payload")
  assert.equal(new TextDecoder().decode(payload), "application payload bytes")
  const asset = await reader.getSection("asset")
  assert.equal(new TextDecoder().decode(asset), "compress me ".repeat(100))
  const storedAsset = await reader.getStoredSection(2)
  assert.ok(storedAsset.length < asset.length)
  const meta = await reader.getSection("meta")
  assert.deepEqual(decodeCbor(meta), { note: "hello" })
})

test("section queries resolve by index name id and type", async () => {
  const reader = await openMahim(await buildFile())
  assert.equal(reader.findSection(0)?.name, "meta")
  assert.equal(reader.findSection("payload")?.applicationDefinedId, 42)
  assert.equal(reader.findSection({ applicationDefinedId: 42 })?.name, "payload")
  assert.equal(reader.findSection({ type: SectionType.Asset })?.name, "asset")
  assert.equal(reader.findSection("missing"), undefined)
  await assert.rejects(reader.getSection("missing"), SectionNotFoundError)
  await assert.rejects(reader.getSection(99), SectionNotFoundError)
})

test("getSection verifies checksums", async () => {
  const bytes = await buildFile()
  const reader = await openMahim(bytes)
  const descriptor = reader.findSection("payload")!
  const corrupted = bytes.slice()
  corrupted[descriptor.payloadOffset + 2] = corrupted[descriptor.payloadOffset + 2]! ^ 0xff
  const corruptedReader = await openMahim(corrupted)
  await assert.rejects(corruptedReader.getSection("payload"), ChecksumMismatchError)
})

test("verify reports integrity status", async () => {
  const bytes = await buildFile()
  const report = await (await openMahim(bytes)).verify()
  assert.equal(report.valid, true)
  assert.equal(report.headerChecksumValid, true)
  assert.equal(report.fileDigestPresent, false)
  assert.equal(report.sections.length, 3)
  assert.ok(report.sections.every((section) => section.checksumValid))

  const corrupted = bytes.slice()
  const descriptor = (await openMahim(corrupted)).findSection("payload")!
  corrupted[descriptor.payloadOffset] = corrupted[descriptor.payloadOffset]! ^ 0x01
  const badReport = await (await openMahim(corrupted)).verify()
  assert.equal(badReport.valid, false)
  assert.equal(badReport.sections[1]!.checksumValid, false)
})

test("file digest verification", async () => {
  const bytes = await createMahimWriter({ fileDigest: true })
    .setApplication({ identifier: "demo", payloadVersion: 1 })
    .addSection({ type: SectionType.Asset, name: "a", data: text("data") })
    .finalize()
  const reader = await openMahim(bytes)
  assert.equal(reader.header.fileDigestSha256, true)
  const report = await reader.verify()
  assert.equal(report.valid, true)
  assert.equal(report.fileDigestValid, true)

  const corrupted = bytes.slice()
  corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0xff
  const badReader = await openMahim(corrupted)
  const badReport = await badReader.verify()
  assert.equal(badReport.fileDigestValid, false)
  assert.equal(badReport.valid, false)
})

test("blob input works through the same API", async () => {
  const bytes = await buildFile()
  const blob = new Blob([bytes as BlobPart])
  const reader = await openMahim(blob)
  assert.equal(reader.listSections().length, 3)
  assert.deepEqual(
    [...(await reader.getSection("payload"))],
    [...text("application payload bytes")],
  )
  const header = await parseMahimHeader(blob)
  assert.equal(header.applicationIdentifier, "demo")
})

test("parseMahimHeader inspects header only", async () => {
  const bytes = await buildFile()
  const header = await parseMahimHeader(bytes)
  assert.equal(header.sectionCount, 3)
  assert.equal(header.magic, "MAHIM")
})

test("writer validates metadata", async () => {
  const writer = createMahimWriter()
  assert.throws(() => writer.setApplication({ identifier: "BAD", payloadVersion: 1 }), InvalidApplicationIdentifierError)
  const writer2 = createMahimWriter()
  assert.throws(
    () => writer2.addSection({ type: 0, data: text("x") }),
    InvalidSectionDirectoryError,
  )
  assert.throws(
    () =>
      writer2.addSection({
        type: SectionType.Metadata,
        data: text("{}"),
        encoding: PayloadEncoding.Raw,
      }),
    InvalidSectionDirectoryError,
  )
  assert.throws(
    () =>
      writer2.addSection({
        type: SectionType.ApplicationPayload,
        data: text("x"),
        encoding: 7,
      }),
    UnsupportedEncodingError,
  )
  assert.throws(
    () =>
      writer2.addSection({
        type: SectionType.ApplicationPayload,
        data: text("x"),
        compression: 9,
      }),
    UnsupportedCompressionError,
  )
  assert.throws(
    () =>
      writer2.addSection({
        type: SectionType.ApplicationPayload,
        data: new Uint8Array([0xff]),
        encoding: PayloadEncoding.Utf8,
      }),
    MalformedUtf8Error,
  )
  assert.throws(
    () =>
      writer2.addSection({
        type: SectionType.ApplicationPayload,
        data: text("x"),
        name: "a".repeat(256),
      }),
    InvalidSectionDirectoryError,
  )
  await assert.rejects(createMahimWriter().finalize(), InvalidApplicationIdentifierError)
})

test("application namespace type range is honored", async () => {
  const appType = 0x00010000 + 5
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "acme", payloadVersion: 1 })
    .addSection({ type: appType, name: "custom", data: text("custom section"), critical: true })
    .finalize()
  const reader = await openMahim(bytes)
  const descriptor = reader.findSection("custom")!
  assert.equal(descriptor.type, appType)
  assert.equal(descriptor.critical, true)
})
