import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { openMahim } from "../src/reader/reader.js"
import { bytesEqual } from "../src/format/primitives.js"
import { decodeCbor } from "../src/encoding/cbor.js"
import {
  ChecksumMismatchError,
  InvalidMagicError,
  MahimError,
  SectionBoundsError,
  SectionOverlapError,
  TruncatedFileError,
  UnsupportedCompressionError,
  UnsupportedFeatureError,
  UnsupportedFormatVersionError,
} from "../src/errors/index.js"
import {
  bombContent,
  buildFixtures,
  compressedContent,
  multiMeta,
  multiPayload,
  multiAsset,
  multiIndex,
  multiExtension,
  singleData,
  utf8Data,
  withDigestAsset,
  withDigestMeta,
  type FixtureResult,
} from "./helpers/fixture-content.js"

const fixturesDir = new URL("../../fixtures/", import.meta.url)
const expectedDir = new URL("../../fixtures/expected/", import.meta.url)

const fixtures = await buildFixtures()

async function readFixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(name, fixturesDir)))
}

function assertExpected(actual: unknown, expected: unknown): void {
  assert.deepEqual(actual, expected)
}

test("all committed fixtures are byte-identical to fresh deterministic builds", async () => {
  for (const [name, result] of fixtures) {
    const committed = await readFixture(name)
    if (result.byteExact) {
      assert.ok(
        bytesEqual(committed, result.bytes),
        `${name} differs from deterministic rebuild`,
      )
    } else {
      assert.equal(committed.length, result.bytes.length, `${name} size drift`)
    }
  }
})

test("golden metadata matches expected JSON", async () => {
  for (const [name, result] of fixtures) {
    if (result.expected === null) {
      continue
    }
    const expectedRaw = await readFile(
      new URL(`${name.replace(/\.mahim$/, "")}.json`, expectedDir),
      "utf8",
    )
    assert.deepEqual(JSON.parse(expectedRaw), result.expected, `expected JSON drift for ${name}`)
  }
})

test("valid fixtures parse with exact metadata", async () => {
  const cases: Array<[string, (fixture: FixtureResult) => Promise<void>]> = [
    ["minimal.mahim", async () => {}],
    [
      "single-section.mahim",
      async () => {
        const reader = await openMahim(await readFixture("single-section.mahim"))
        assert.equal(reader.applicationIdentifier, "svelp")
        assert.equal(reader.header.applicationPayloadVersion, 3)
        const section = reader.listSections()[0]!
        assert.equal(section.name, "payload")
        assert.equal(section.version, 3)
        assert.equal(section.applicationDefinedId, 1)
        assert.ok(bytesEqual(await reader.getSection(0), singleData))
      },
    ],
    [
      "multi-section.mahim",
      async () => {
        const reader = await openMahim(await readFixture("multi-section.mahim"))
        assert.deepEqual(
          reader.listSections().map((section) => section.name),
          ["meta", "payload", "asset", "index", "demo-extension"],
        )
        assert.deepEqual(decodeCbor(await reader.getSection("meta")), {
          title: "multi",
          items: 3,
        })
        assert.ok(bytesEqual(await reader.getSection("payload"), multiPayload))
        assert.ok(bytesEqual(await reader.getSection("asset"), multiAsset))
        assert.ok(bytesEqual(await reader.getSection("index"), multiIndex))
        assert.ok(bytesEqual(await reader.getSection("demo-extension"), multiExtension))
        void multiMeta
      },
    ],
    [
      "compressed-section.mahim",
      async () => {
        const reader = await openMahim(await readFixture("compressed-section.mahim"))
        const descriptor = reader.listSections()[0]!
        assert.equal(descriptor.compression, 1)
        assert.ok(descriptor.storedLength < descriptor.uncompressedLength)
        assert.ok(bytesEqual(await reader.getSection(0), compressedContent))
      },
    ],
    [
      "unknown-optional-section.mahim",
      async () => {
        const reader = await openMahim(await readFixture("unknown-optional-section.mahim"))
        assert.equal(reader.listSections().length, 3)
        assert.ok(bytesEqual(await reader.getSection("known"), new TextEncoder().encode("known section")))
        assert.ok(bytesEqual(await reader.getSection("app-future"), new TextEncoder().encode("application-defined unknown section")))
        const report = await reader.verify()
        assert.equal(report.valid, true)
      },
    ],
    [
      "with-file-digest.mahim",
      async () => {
        const reader = await openMahim(await readFixture("with-file-digest.mahim"))
        assert.equal(reader.header.fileDigestSha256, true)
        const report = await reader.verify()
        assert.equal(report.valid, true)
        assert.equal(report.fileDigestValid, true)
        assert.deepEqual(decodeCbor(await reader.getSection("meta")), { digest: true })
        assert.ok(bytesEqual(await reader.getSection("asset"), withDigestAsset))
        void withDigestMeta
      },
    ],
    [
      "utf8-names.mahim",
      async () => {
        const reader = await openMahim(await readFixture("utf8-names.mahim"))
        assert.equal(reader.applicationIdentifier, "com.example.tool")
        assert.equal(reader.listSections()[0]!.name, "вложение-データ")
        assert.ok(bytesEqual(await reader.getSection(0), utf8Data))
      },
    ],
    [
      "decompression-bomb.mahim",
      async () => {
        const reader = await openMahim(await readFixture("decompression-bomb.mahim"))
        assert.ok(bytesEqual(await reader.getSection("bomb"), bombContent))
      },
    ],
  ]
  for (const [name, check] of cases) {
    await check(fixtures.get(name)!)
  }
})

test("corrupt-checksum fixture is structurally valid but fails integrity checks", async () => {
  const reader = await openMahim(await readFixture("corrupt-checksum.mahim"))
  await assert.rejects(reader.getSection("payload"), ChecksumMismatchError)
  const report = await reader.verify()
  assert.equal(report.valid, false)
  assert.equal(report.sections[0]!.checksumValid, false)
  assert.equal(report.headerChecksumValid, true)
})

test("invalid fixtures are rejected with precise errors", async () => {
  await assert.rejects(openMahim(await readFixture("invalid-magic.mahim")), InvalidMagicError)
  await assert.rejects(openMahim(await readFixture("truncated.mahim")), TruncatedFileError)
  await assert.rejects(
    openMahim(await readFixture("overlapping-sections.mahim")),
    SectionOverlapError,
  )
  await assert.rejects(openMahim(await readFixture("invalid-offset.mahim")), SectionBoundsError)
  await assert.rejects(
    openMahim(await readFixture("unsupported-version.mahim")),
    UnsupportedFormatVersionError,
  )
  await assert.rejects(
    openMahim(await readFixture("unsupported-compression.mahim")),
    UnsupportedCompressionError,
  )
  await assert.rejects(
    openMahim(await readFixture("unknown-critical-section.mahim")),
    UnsupportedFeatureError,
  )
  const inspected = await openMahim(await readFixture("unknown-critical-section.mahim"), {
    rejectUnknownCritical: false,
  })
  assert.equal(inspected.listSections().length, 2)
  const accepted = await openMahim(await readFixture("unknown-critical-section.mahim"), {
    understoodSectionTypes: [0x00010042],
  })
  assert.equal(accepted.listSections().length, 2)
})

test("fixture directory contains only known fixtures", async () => {
  const names = (await readdir(fixturesDir)).filter((name) => name.endsWith(".mahim")).sort()
  assert.deepEqual(names, [...fixtures.keys()].sort())
  for (const name of names) {
    const bytes = await readFixture(name)
    try {
      await openMahim(bytes)
    } catch (error) {
      assert.ok(error instanceof MahimError, `${name} raised non-MAHIM error`)
    }
  }
})
