import { test } from "node:test"
import assert from "node:assert/strict"
import { createMahimWriter } from "../src/writer/writer.js"
import { openMahim } from "../src/reader/reader.js"
import { CompressionMethod, SectionType } from "../src/format/constants.js"
import { encodeCbor, decodeCbor } from "../src/encoding/cbor.js"
import { bytesEqual } from "../src/format/primitives.js"

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

test("identical inputs produce identical bytes", async () => {
  const build = () =>
    createMahimWriter({ fileDigest: true })
      .setApplication({ identifier: "demo", payloadVersion: 5 })
      .addSection({
        type: SectionType.Metadata,
        name: "meta",
        data: encodeCbor({ z: 1, a: [1, 2], m: { k: "v" } }),
      })
      .addSection({ type: SectionType.Asset, name: "blob", data: new Uint8Array([0, 1, 2, 250]) })
      .addSection({
        type: SectionType.ApplicationPayload,
        name: "body",
        data: text("deterministic content"),
      })
      .finalize()
  const first = await build()
  const second = await build()
  assert.ok(bytesEqual(first, second))
})

test("canonical CBOR map ordering is stable regardless of key insertion order", async () => {
  const a = await createMahimWriter()
    .setApplication({ identifier: "demo", payloadVersion: 1 })
    .addSection({ type: SectionType.Metadata, data: encodeCbor({ b: 1, a: 2 }) })
    .finalize()
  const b = await createMahimWriter()
    .setApplication({ identifier: "demo", payloadVersion: 1 })
    .addSection({ type: SectionType.Metadata, data: encodeCbor({ a: 2, b: 1 }) })
    .finalize()
  assert.ok(bytesEqual(a, b))
})

test("empty file with no sections is valid", async () => {
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "empty", payloadVersion: 0 })
    .finalize()
  const reader = await openMahim(bytes)
  assert.equal(reader.listSections().length, 0)
  const report = await reader.verify()
  assert.equal(report.valid, true)
})

test("round trip preserves empty sections and binary data", async () => {
  const empty = new Uint8Array(0)
  const binary = new Uint8Array(256)
  for (let i = 0; i < 256; i += 1) {
    binary[i] = i
  }
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "bin", payloadVersion: 1 })
    .addSection({ type: SectionType.Asset, name: "empty", data: empty })
    .addSection({ type: SectionType.Asset, name: "bytes", data: binary })
    .addSection({
      type: SectionType.Asset,
      name: "compressed-empty",
      compression: CompressionMethod.DeflateRaw,
      data: empty,
    })
    .finalize()
  const reader = await openMahim(bytes)
  assert.equal((await reader.getSection("empty")).length, 0)
  assert.ok(bytesEqual(await reader.getSection("bytes"), binary))
  assert.equal((await reader.getSection("compressed-empty")).length, 0)
  const stored = await reader.getStoredSection("compressed-empty")
  assert.ok(stored.length > 0)
})

test("round trip preserves UTF-8 names and identifiers", async () => {
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "com.example.tool", payloadVersion: 1 })
    .addSection({ type: SectionType.Asset, name: "признак-データ-ক্যানারি", data: text("ok") })
    .finalize()
  const reader = await openMahim(bytes)
  assert.equal(reader.listSections()[0]!.name, "признак-データ-ক্যানারি")
  assert.equal(reader.applicationIdentifier, "com.example.tool")
})

test("large section round trips without whole-file duplication issues", async () => {
  const large = new Uint8Array(2 * 1024 * 1024)
  for (let i = 0; i < large.length; i += 7) {
    large[i] = i & 0xff
  }
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "big", payloadVersion: 1 })
    .addSection({ type: SectionType.Asset, name: "large", data: large })
    .addSection({ type: SectionType.Asset, name: "small", data: text("tiny") })
    .finalize()
  const reader = await openMahim(bytes)
  const small = await reader.getSection("small")
  assert.equal(new TextDecoder().decode(small), "tiny")
  const restored = await reader.getSection("large")
  assert.equal(restored.length, large.length)
  assert.ok(bytesEqual(restored, large))
})

test("compressed round trip with mixed methods", async () => {
  const payload = text("aaaaabbbbccccdddd".repeat(64))
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "mix", payloadVersion: 1 })
    .addSection({
      type: SectionType.ApplicationPayload,
      name: "deflated",
      compression: CompressionMethod.DeflateRaw,
      data: payload,
    })
    .addSection({
      type: SectionType.ApplicationPayload,
      name: "raw",
      data: payload,
    })
    .finalize()
  const reader = await openMahim(bytes)
  const deflated = reader.findSection("deflated")!
  const raw = reader.findSection("raw")!
  assert.ok(deflated.storedLength < deflated.uncompressedLength)
  assert.equal(raw.storedLength, raw.uncompressedLength)
  assert.ok(bytesEqual(await reader.getSection("deflated"), payload))
  assert.ok(bytesEqual(await reader.getSection("raw"), payload))
})

test("structured metadata round trip", async () => {
  const metadata = {
    title: "Study",
    version: 3,
    tags: ["a", "b"],
    nested: { flag: true, missing: null, blob: new Uint8Array([9, 8, 7]) },
  }
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "meta", payloadVersion: 1 })
    .addSection({ type: SectionType.Metadata, data: encodeCbor(metadata) })
    .finalize()
  const reader = await openMahim(bytes)
  const decoded = decodeCbor(await reader.getSection(0)) as typeof metadata
  assert.equal(decoded.title, "Study")
  assert.equal(decoded.version, 3)
  assert.deepEqual(decoded.tags, ["a", "b"])
  assert.equal(decoded.nested.flag, true)
  assert.equal(decoded.nested.missing, null)
  assert.deepEqual([...decoded.nested.blob], [9, 8, 7])
})

test("many small sections round trip", async () => {
  const writer = createMahimWriter().setApplication({ identifier: "many", payloadVersion: 1 })
  for (let i = 0; i < 100; i += 1) {
    writer.addSection({
      type: SectionType.ApplicationPayload,
      name: `s${i}`,
      applicationDefinedId: i,
      data: text(`payload-${i}`),
    })
  }
  const bytes = await writer.finalize()
  const reader = await openMahim(bytes)
  assert.equal(reader.listSections().length, 100)
  for (let i = 0; i < 100; i += 1) {
    assert.equal(new TextDecoder().decode(await reader.getSection(`s${i}`)), `payload-${i}`)
    assert.equal(reader.findSection({ applicationDefinedId: i })?.name, `s${i}`)
  }
})
