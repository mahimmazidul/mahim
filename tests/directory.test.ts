import { test } from "node:test"
import assert from "node:assert/strict"
import {
  decodeSectionDescriptor,
  encodeSectionDescriptor,
  type SectionDescriptorInput,
} from "../src/format/section.js"
import {
  decodeSectionDirectory,
  directoryLengthFor,
  encodeSectionDirectory,
} from "../src/format/directory.js"
import { DEFAULT_LIMITS, SectionType } from "../src/format/constants.js"
import type { MahimHeader } from "../src/format/header.js"
import {
  InvalidSectionDirectoryError,
  UnsupportedCompressionError,
  UnsupportedEncodingError,
  UnsupportedFeatureError,
} from "../src/errors/index.js"
import { writeUint32LE, writeUint8 } from "../src/format/primitives.js"

function makeDescriptor(overrides?: Partial<SectionDescriptorInput>): SectionDescriptorInput {
  return {
    type: SectionType.ApplicationPayload,
    version: 1,
    payloadOffset: 200,
    storedLength: 10,
    uncompressedLength: 10,
    checksum: 0x11223344,
    encoding: 0,
    compression: 0,
    flags: 0x0001,
    applicationDefinedId: 7,
    name: "payload",
    ...overrides,
  }
}

test("section descriptor encode decode round trip", () => {
  const input = makeDescriptor()
  const bytes = encodeSectionDescriptor(input)
  assert.equal(bytes.length, 48)
  const descriptor = decodeSectionDescriptor(bytes, 0, 3, DEFAULT_LIMITS)
  assert.equal(descriptor.index, 3)
  assert.equal(descriptor.type, input.type)
  assert.equal(descriptor.version, 1)
  assert.equal(descriptor.payloadOffset, 200)
  assert.equal(descriptor.storedLength, 10)
  assert.equal(descriptor.uncompressedLength, 10)
  assert.equal(descriptor.checksum, 0x11223344)
  assert.equal(descriptor.encoding, 0)
  assert.equal(descriptor.compression, 0)
  assert.equal(descriptor.optional, true)
  assert.equal(descriptor.critical, false)
  assert.equal(descriptor.applicationDefinedId, 7)
})

test("critical flag decodes", () => {
  const bytes = encodeSectionDescriptor(makeDescriptor({ flags: 0x0002 }))
  const descriptor = decodeSectionDescriptor(bytes, 0, 0, DEFAULT_LIMITS)
  assert.equal(descriptor.critical, true)
  assert.equal(descriptor.optional, false)
})

test("invalid flag combinations are rejected", () => {
  assert.throws(
    () => decodeSectionDescriptor(encodeSectionDescriptor(makeDescriptor({ flags: 0 })), 0, 0, DEFAULT_LIMITS),
    InvalidSectionDirectoryError,
  )
  assert.throws(
    () => decodeSectionDescriptor(encodeSectionDescriptor(makeDescriptor({ flags: 3 })), 0, 0, DEFAULT_LIMITS),
    InvalidSectionDirectoryError,
  )
  assert.throws(
    () => decodeSectionDescriptor(encodeSectionDescriptor(makeDescriptor({ flags: 0x0005 })), 0, 0, DEFAULT_LIMITS),
    UnsupportedFeatureError,
  )
})

test("unknown encodings and compression methods are rejected", () => {
  assert.throws(
    () => decodeSectionDescriptor(encodeSectionDescriptor(makeDescriptor({ encoding: 9 })), 0, 0, DEFAULT_LIMITS),
    UnsupportedEncodingError,
  )
  assert.throws(
    () => decodeSectionDescriptor(encodeSectionDescriptor(makeDescriptor({ compression: 5 })), 0, 0, DEFAULT_LIMITS),
    UnsupportedCompressionError,
  )
})

test("uncompressed length must equal stored length without compression", () => {
  assert.throws(
    () =>
      decodeSectionDescriptor(
        encodeSectionDescriptor(makeDescriptor({ uncompressedLength: 11 })),
        0,
        0,
        DEFAULT_LIMITS,
      ),
    InvalidSectionDirectoryError,
  )
})

test("type zero is rejected", () => {
  assert.throws(
    () => decodeSectionDescriptor(encodeSectionDescriptor(makeDescriptor({ type: 0 })), 0, 0, DEFAULT_LIMITS),
    InvalidSectionDirectoryError,
  )
})

test("section directory round trip with names", () => {
  const inputs = [
    makeDescriptor({ name: "", type: SectionType.Metadata }),
    makeDescriptor({ name: "alpha" }),
    makeDescriptor({ name: "β-section", applicationDefinedId: 0 }),
  ]
  const { directory } = encodeSectionDirectory(inputs)
  assert.equal(directory.length, directoryLengthFor(inputs))
  const header = fakeHeader(inputs.length, directory.length)
  const descriptors = decodeSectionDirectory(directory, header, DEFAULT_LIMITS)
  assert.equal(descriptors.length, 3)
  assert.equal(descriptors[0]!.name, "")
  assert.equal(descriptors[1]!.name, "alpha")
  assert.equal(descriptors[2]!.name, "β-section")
  assert.equal(descriptors[2]!.index, 2)
})

test("multiple metadata sections are rejected", () => {
  const inputs = [
    makeDescriptor({ name: "m1", type: SectionType.Metadata }),
    makeDescriptor({ name: "m2", type: SectionType.Metadata }),
  ]
  const { directory } = encodeSectionDirectory(inputs)
  assert.throws(
    () => decodeSectionDirectory(directory, fakeHeader(2, directory.length), DEFAULT_LIMITS),
    InvalidSectionDirectoryError,
  )
})

test("name table truncation is rejected", () => {
  const inputs = [makeDescriptor({ name: "abcdef" })]
  const { directory } = encodeSectionDirectory(inputs)
  assert.throws(
    () => decodeSectionDirectory(directory.slice(0, directory.length - 2), fakeHeader(1, 48), DEFAULT_LIMITS),
    InvalidSectionDirectoryError,
  )
})

test("directory length mismatch is rejected", () => {
  const inputs = [makeDescriptor({ name: "x" })]
  const { directory } = encodeSectionDirectory(inputs)
  assert.throws(
    () => decodeSectionDirectory(directory, fakeHeader(1, 50), DEFAULT_LIMITS),
    InvalidSectionDirectoryError,
  )
})

test("name length overflow into header field is bounded", () => {
  const bytes = encodeSectionDescriptor(makeDescriptor({ name: "ok" }))
  writeUint32LE(bytes, 44, 999)
  writeUint8(bytes, 36, 0)
  assert.throws(
    () => decodeSectionDescriptor(bytes, 0, 0, { ...DEFAULT_LIMITS, maxSectionNameLength: 255 }),
    InvalidSectionDirectoryError,
  )
})

function fakeHeader(sectionCount: number, directoryLength: number): MahimHeader {
  return {
    magic: "MAHIM",
    formatVersion: { major: 1, minor: 0 },
    headerFlags: 0,
    headerLength: 61,
    applicationIdentifier: "test",
    applicationPayloadVersion: 0,
    sectionCount,
    sectionDirectoryOffset: 61,
    sectionDirectoryLength: directoryLength,
    fileLength: 61 + directoryLength + 100,
    headerChecksum: 0,
    fileDigestSha256: false,
  }
}
