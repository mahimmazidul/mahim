import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeHeader, encodeHeader } from "../src/format/header.js"
import { DEFAULT_LIMITS, HEADER_FIXED_LENGTH } from "../src/format/constants.js"
import {
  FileLengthMismatchError,
  HeaderChecksumError,
  InvalidApplicationIdentifierError,
  InvalidMagicError,
  MalformedHeaderError,
  TruncatedFileError,
  UnsupportedFeatureError,
  UnsupportedFormatVersionError,
} from "../src/errors/index.js"
import { writeUint32LE, writeUint8 } from "../src/format/primitives.js"

function buildHeader(overrides?: Partial<Parameters<typeof encodeHeader>[0]>): Uint8Array {
  const identifier = overrides?.applicationIdentifier ?? "svelp"
  const identifierLength = new TextEncoder().encode(identifier).length
  return encodeHeader({
    applicationIdentifier: identifier,
    applicationPayloadVersion: 3,
    sectionCount: 2,
    sectionDirectoryOffset: HEADER_FIXED_LENGTH + identifierLength + 4,
    sectionDirectoryLength: 96,
    fileLength: 500,
    fileDigestSha256: false,
    ...overrides,
  })
}

test("header encode decode round trip", () => {
  const bytes = buildHeader()
  assert.equal(bytes.length, HEADER_FIXED_LENGTH + 5)
  const header = decodeHeader(bytes, 500, DEFAULT_LIMITS)
  assert.equal(header.magic, "MAHIM")
  assert.equal(header.formatVersion.major, 1)
  assert.equal(header.formatVersion.minor, 0)
  assert.equal(header.applicationIdentifier, "svelp")
  assert.equal(header.applicationPayloadVersion, 3)
  assert.equal(header.sectionCount, 2)
  assert.equal(header.sectionDirectoryOffset, 65)
  assert.equal(header.sectionDirectoryLength, 96)
  assert.equal(header.fileLength, 500)
  assert.equal(header.headerLength, 61)
  assert.equal(header.fileDigestSha256, false)
})

test("file digest flag round trips", () => {
  const bytes = buildHeader({ fileDigestSha256: true, fileLength: 532 })
  const header = decodeHeader(bytes, 532, DEFAULT_LIMITS)
  assert.equal(header.fileDigestSha256, true)
  assert.equal(header.headerFlags & 0x01, 0x01)
})

test("invalid magic is rejected", () => {
  const bytes = buildHeader()
  bytes[0] = 0x4e
  assert.throws(() => decodeHeader(bytes, 500, DEFAULT_LIMITS), InvalidMagicError)
  assert.throws(() => decodeHeader(new Uint8Array([1, 2]), 2, DEFAULT_LIMITS), InvalidMagicError)
})

test("unsupported format major version is rejected", () => {
  const bytes = buildHeader()
  writeUint8(bytes, 5, 2)
  assert.throws(() => decodeHeader(bytes, 500, DEFAULT_LIMITS), UnsupportedFormatVersionError)
})

test("header checksum detects header corruption", () => {
  const bytes = buildHeader()
  bytes[14] = bytes[14]! ^ 0xff
  assert.throws(() => decodeHeader(bytes, 500, DEFAULT_LIMITS), HeaderChecksumError)
})

test("reserved header bytes must be zero", () => {
  const bytes = buildHeader()
  writeUint8(bytes, 53, 1)
  assert.throws(() => decodeHeader(bytes, 500, DEFAULT_LIMITS), (error: unknown) => {
    return error instanceof HeaderChecksumError || error instanceof MalformedHeaderError
  })
})

test("unknown header flag bits are rejected", () => {
  const bytes = buildHeader()
  writeUint8(bytes, 7, 0x80)
  assert.throws(() => decodeHeader(bytes, 500, DEFAULT_LIMITS), UnsupportedFeatureError)
})

test("header length must match identifier length", () => {
  const bytes = buildHeader()
  writeUint32LE(bytes, 8, 60)
  writeUint32LE(bytes, 46, 0)
  assert.throws(() => decodeHeader(bytes, 500, DEFAULT_LIMITS), (error: unknown) => {
    return error instanceof MalformedHeaderError || error instanceof HeaderChecksumError
  })
})

test("file length mismatch and truncation are distinguished", () => {
  const bytes = buildHeader()
  assert.throws(() => decodeHeader(bytes, 400, DEFAULT_LIMITS), TruncatedFileError)
  assert.throws(() => decodeHeader(bytes, 600, DEFAULT_LIMITS), FileLengthMismatchError)
})

test("invalid application identifiers are rejected", () => {
  assert.throws(() => buildHeader({ applicationIdentifier: "Svelp" }), InvalidApplicationIdentifierError)
  assert.throws(() => buildHeader({ applicationIdentifier: "1app" }), InvalidApplicationIdentifierError)
  assert.throws(() => buildHeader({ applicationIdentifier: "" }), InvalidApplicationIdentifierError)
  assert.throws(() => buildHeader({ applicationIdentifier: "has space" }), InvalidApplicationIdentifierError)
  assert.throws(() => buildHeader({ applicationIdentifier: "a".repeat(256) }), InvalidApplicationIdentifierError)
})

test("identifier grammar accepts documented charset", () => {
  for (const identifier of ["a", "svelp", "com.example.tool", "app-v2", "app_v2", "x9"]) {
    const bytes = buildHeader({ applicationIdentifier: identifier })
    const header = decodeHeader(bytes, 500, DEFAULT_LIMITS)
    assert.equal(header.applicationIdentifier, identifier)
  }
})

test("directory bounds are validated", () => {
  assert.throws(
    () =>
      decodeHeader(
        buildHeader({ sectionDirectoryOffset: 10, sectionDirectoryLength: 96 }),
        500,
        DEFAULT_LIMITS,
      ),
    MalformedHeaderError,
  )
  assert.throws(
    () =>
      decodeHeader(
        buildHeader({ sectionDirectoryOffset: 70, sectionDirectoryLength: 440 }),
        500,
        DEFAULT_LIMITS,
      ),
    MalformedHeaderError,
  )
})

test("truncated input is rejected", () => {
  const bytes = buildHeader()
  assert.throws(() => decodeHeader(bytes.slice(0, 40), 40, DEFAULT_LIMITS), TruncatedFileError)
})
