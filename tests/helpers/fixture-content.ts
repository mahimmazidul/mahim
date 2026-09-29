import {
  CompressionMethod,
  PayloadEncoding,
  SECTION_FLAG_CRITICAL,
  SECTION_FLAG_OPTIONAL,
  SectionType,
  concatBytes,
  createMahimWriter,
  encodeCbor,
  encodeHeader,
  encodeSectionDescriptor,
  encodeSectionDirectory,
  crc32c,
  sha256,
  writeUint32LE,
  writeUint8,
} from "../../src/index.js"

export interface FixtureResult {
  readonly bytes: Uint8Array
  readonly expected: unknown
  readonly byteExact: boolean
}

export interface ManualSection {
  readonly type: number
  readonly name: string
  readonly data: Uint8Array
  readonly version?: number
  readonly encoding?: number
  readonly compression?: number
  readonly flags?: number
  readonly applicationDefinedId?: number
  readonly payloadOffset?: number
  readonly uncompressedLength?: number
}

export interface ManualFileOptions {
  readonly identifier?: string
  readonly payloadVersion?: number
  readonly sections: readonly ManualSection[]
  readonly fileDigest?: boolean
  readonly fileLength?: number
}

const encoder = new TextEncoder()

export function text(value: string): Uint8Array {
  return encoder.encode(value)
}

export function buildManual(options: ManualFileOptions): Uint8Array {
  const identifier = options.identifier ?? "fixture"
  const payloadVersion = options.payloadVersion ?? 1
  const sections = options.sections
  const fileDigest = options.fileDigest ?? false
  const idBytes = text(identifier)
  const headerLength = 56 + idBytes.length
  const nameTableLength = sections.reduce(
    (total, section) => total + text(section.name).length,
    0,
  )
  const directoryLength = sections.length * 48 + nameTableLength
  let cursor = headerLength + directoryLength
  const prepared = sections.map((section) => {
    const payloadOffset = section.payloadOffset ?? cursor
    if (section.payloadOffset === undefined) {
      cursor += section.data.length
    }
    return { ...section, payloadOffset }
  })
  let payloadEnd = headerLength + directoryLength
  for (const section of prepared) {
    payloadEnd = Math.max(payloadEnd, section.payloadOffset + section.data.length)
  }
  const digestSize = fileDigest ? 32 : 0
  const fileLength = options.fileLength ?? payloadEnd + digestSize
  const descriptorInputs = prepared.map((section) => ({
    type: section.type,
    version: section.version ?? 0,
    payloadOffset: section.payloadOffset,
    storedLength: section.data.length,
    uncompressedLength: section.uncompressedLength ?? section.data.length,
    checksum: crc32c(section.data),
    encoding: section.encoding ?? PayloadEncoding.Raw,
    compression: section.compression ?? CompressionMethod.None,
    flags: section.flags ?? SECTION_FLAG_OPTIONAL,
    applicationDefinedId: section.applicationDefinedId ?? 0,
    name: section.name,
  }))
  const header = encodeHeader({
    applicationIdentifier: identifier,
    applicationPayloadVersion: payloadVersion,
    sectionCount: prepared.length,
    sectionDirectoryOffset: headerLength,
    sectionDirectoryLength: directoryLength,
    fileLength,
    fileDigestSha256: fileDigest,
  })
  const { directory } = encodeSectionDirectory(descriptorInputs)
  const body = new Uint8Array(fileLength - digestSize)
  body.set(header, 0)
  body.set(directory, headerLength)
  for (const section of prepared) {
    if (section.payloadOffset + section.data.length <= body.length) {
      body.set(section.data, section.payloadOffset)
    }
  }
  if (!fileDigest) {
    return body
  }
  return concatBytes([body, sha256(body)], fileLength)
}

export function fixHeaderChecksum(bytes: Uint8Array): Uint8Array {
  const headerLength =
    bytes[8]! | (bytes[9]! << 8) | (bytes[10]! << 16) | (bytes[11]! << 24)
  const copy = bytes.slice(0, headerLength)
  writeUint32LE(copy, 46, 0)
  writeUint32LE(bytes, 46, crc32c(copy))
  return bytes
}

interface ExpectedSection {
  name: string
  type: number
  version: number
  encoding: number
  compression: number
  optional: boolean
  critical: boolean
  applicationDefinedId: number
  uncompressedLength: number
}

function expectedSection(overrides: Partial<ExpectedSection>): ExpectedSection {
  return {
    name: "",
    type: SectionType.ApplicationPayload,
    version: 0,
    encoding: PayloadEncoding.Raw,
    compression: CompressionMethod.None,
    optional: true,
    critical: false,
    applicationDefinedId: 0,
    uncompressedLength: 0,
    ...overrides,
  }
}

function expectedHeader(
  overrides: Record<string, unknown>,
  fileLength: number,
): Record<string, unknown> {
  return {
    magic: "MAHIM",
    formatMajor: 1,
    formatMinor: 0,
    applicationIdentifier: "fixture",
    applicationPayloadVersion: 1,
    sectionCount: 0,
    fileDigestSha256: false,
    ...overrides,
    fileLength,
  }
}

export const singleData = text("hello mahim")
export const multiMeta = encodeCbor({ title: "multi", items: 3 })
export const multiPayload = text("body bytes")
export const multiAsset = new Uint8Array([0, 1, 2, 3, 250])
export const multiIndex = encodeCbor({ offsets: [1, 2, 3] })
export const multiExtension = text("extension record")
export const compressedContent = text("compressible payload ".repeat(64))
export const bombContent = new Uint8Array(4 * 1024 * 1024)
export const withDigestMeta = encodeCbor({ digest: true })
export const withDigestAsset = text("archived content")
export const utf8Data = text("unicode name section")

export async function buildFixtures(): Promise<Map<string, FixtureResult>> {
  const fixtures = new Map<string, FixtureResult>()

  const minimal = await createMahimWriter()
    .setApplication({ identifier: "mahim", payloadVersion: 0 })
    .finalize()
  fixtures.set("minimal.mahim", {
    bytes: minimal,
    byteExact: true,
    expected: {
      header: expectedHeader(
        { applicationIdentifier: "mahim", applicationPayloadVersion: 0 },
        minimal.length,
      ),
      sections: [],
    },
  })

  const single = await createMahimWriter()
    .setApplication({ identifier: "svelp", payloadVersion: 3 })
    .addSection({
      type: SectionType.ApplicationPayload,
      name: "payload",
      version: 3,
      applicationDefinedId: 1,
      data: singleData,
    })
    .finalize()
  fixtures.set("single-section.mahim", {
    bytes: single,
    byteExact: true,
    expected: {
      header: expectedHeader(
        {
          applicationIdentifier: "svelp",
          applicationPayloadVersion: 3,
          sectionCount: 1,
        },
        single.length,
      ),
      sections: [
        expectedSection({
          name: "payload",
          version: 3,
          applicationDefinedId: 1,
          uncompressedLength: singleData.length,
        }),
      ],
    },
  })

  const multi = await createMahimWriter()
    .setApplication({ identifier: "mahim", payloadVersion: 1 })
    .addSection({ type: SectionType.Metadata, name: "meta", data: multiMeta })
    .addSection({ type: SectionType.ApplicationPayload, name: "payload", data: multiPayload })
    .addSection({ type: SectionType.Asset, name: "asset", data: multiAsset })
    .addSection({ type: SectionType.Index, name: "index", data: multiIndex })
    .addSection({ type: SectionType.Extension, name: "demo-extension", data: multiExtension })
    .finalize()
  fixtures.set("multi-section.mahim", {
    bytes: multi,
    byteExact: true,
    expected: {
      header: expectedHeader(
        { applicationIdentifier: "mahim", sectionCount: 5 },
        multi.length,
      ),
      sections: [
        expectedSection({
          name: "meta",
          type: SectionType.Metadata,
          encoding: PayloadEncoding.Cbor,
          uncompressedLength: multiMeta.length,
        }),
        expectedSection({
          name: "payload",
          uncompressedLength: multiPayload.length,
        }),
        expectedSection({
          name: "asset",
          type: SectionType.Asset,
          uncompressedLength: multiAsset.length,
        }),
        expectedSection({
          name: "index",
          type: SectionType.Index,
          encoding: PayloadEncoding.Cbor,
          uncompressedLength: multiIndex.length,
        }),
        expectedSection({
          name: "demo-extension",
          type: SectionType.Extension,
          uncompressedLength: multiExtension.length,
        }),
      ],
    },
  })

  const compressed = await createMahimWriter()
    .setApplication({ identifier: "mahim", payloadVersion: 1 })
    .addSection({
      type: SectionType.Asset,
      name: "compressed",
      compression: CompressionMethod.DeflateRaw,
      data: compressedContent,
    })
    .finalize()
  fixtures.set("compressed-section.mahim", {
    bytes: compressed,
    byteExact: false,
    expected: {
      header: expectedHeader(
        { applicationIdentifier: "mahim", sectionCount: 1 },
        compressed.length,
      ),
      sections: [
        expectedSection({
          name: "compressed",
          type: SectionType.Asset,
          compression: CompressionMethod.DeflateRaw,
          uncompressedLength: compressedContent.length,
        }),
      ],
    },
  })

  const unknownOptional = buildManual({
    identifier: "mahim",
    sections: [
      { type: SectionType.ApplicationPayload, name: "known", data: text("known section") },
      {
        type: 0x00010042,
        name: "app-future",
        flags: SECTION_FLAG_OPTIONAL,
        data: text("application-defined unknown section"),
      },
      {
        type: SectionType.Extension,
        name: "future-extension",
        flags: SECTION_FLAG_OPTIONAL,
        data: text("extension payload"),
      },
    ],
  })
  fixtures.set("unknown-optional-section.mahim", {
    bytes: unknownOptional,
    byteExact: true,
    expected: {
      header: expectedHeader(
        { applicationIdentifier: "mahim", sectionCount: 3 },
        unknownOptional.length,
      ),
      sections: [
        expectedSection({ name: "known", uncompressedLength: 13 }),
        expectedSection({
          name: "app-future",
          type: 0x00010042,
          uncompressedLength: 35,
        }),
        expectedSection({
          name: "future-extension",
          type: SectionType.Extension,
          uncompressedLength: 17,
        }),
      ],
    },
  })

  const unknownCritical = buildManual({
    identifier: "mahim",
    sections: [
      { type: SectionType.ApplicationPayload, name: "known", data: text("known section") },
      {
        type: 0x00010042,
        name: "app-future",
        flags: SECTION_FLAG_CRITICAL,
        data: text("application-defined unknown section"),
      },
    ],
  })
  fixtures.set("unknown-critical-section.mahim", {
    bytes: unknownCritical,
    byteExact: true,
    expected: {
      header: expectedHeader(
        { applicationIdentifier: "mahim", sectionCount: 2 },
        unknownCritical.length,
      ),
      sections: [
        expectedSection({ name: "known", uncompressedLength: 13 }),
        expectedSection({
          name: "app-future",
          type: 0x00010042,
          critical: true,
          optional: false,
          uncompressedLength: 35,
        }),
      ],
    },
  })

  const validBase = await createMahimWriter()
    .setApplication({ identifier: "mahim", payloadVersion: 1 })
    .addSection({
      type: SectionType.ApplicationPayload,
      name: "payload",
      data: text("checksummed bytes"),
    })
    .finalize()

  const corruptChecksum = validBase.slice()
  corruptChecksum[corruptChecksum.length - 3] = corruptChecksum[corruptChecksum.length - 3]! ^ 0xff
  fixtures.set("corrupt-checksum.mahim", {
    bytes: corruptChecksum,
    byteExact: true,
    expected: {
      header: expectedHeader(
        { applicationIdentifier: "mahim", sectionCount: 1 },
        corruptChecksum.length,
      ),
      sections: [
        expectedSection({ name: "payload", uncompressedLength: 17 }),
      ],
    },
  })

  const invalidMagic = validBase.slice()
  invalidMagic.set(text("NOTIM"), 0)
  fixtures.set("invalid-magic.mahim", {
    bytes: invalidMagic,
    byteExact: true,
    expected: null,
  })

  const truncated = validBase.slice(0, validBase.length - 6)
  fixtures.set("truncated.mahim", {
    bytes: truncated,
    byteExact: true,
    expected: null,
  })

  const overlapping = buildManual({
    identifier: "mahim",
    sections: [
      {
        type: SectionType.ApplicationPayload,
        name: "first",
        data: text("AAAAAAAAAA"),
        payloadOffset: 168,
      },
      {
        type: SectionType.ApplicationPayload,
        name: "second",
        data: text("BBBBBBBBBB"),
        payloadOffset: 173,
      },
    ],
  })
  fixtures.set("overlapping-sections.mahim", {
    bytes: overlapping,
    byteExact: true,
    expected: null,
  })

  const unsupportedVersion = validBase.slice()
  writeUint8(unsupportedVersion, 5, 2)
  fixHeaderChecksum(unsupportedVersion)
  fixtures.set("unsupported-version.mahim", {
    bytes: unsupportedVersion,
    byteExact: true,
    expected: null,
  })

  const unsupportedCompression = buildManual({
    identifier: "mahim",
    sections: [
      {
        type: SectionType.Asset,
        name: "future-compressed",
        data: text("bytes"),
        compression: 9,
      },
    ],
  })
  fixtures.set("unsupported-compression.mahim", {
    bytes: unsupportedCompression,
    byteExact: true,
    expected: null,
  })

  const invalidOffset = buildManual({
    identifier: "mahim",
    sections: [
      {
        type: SectionType.Asset,
        name: "misplaced",
        data: text("bytes"),
        payloadOffset: 4096,
      },
    ],
    fileLength: 173,
  })
  fixtures.set("invalid-offset.mahim", {
    bytes: invalidOffset,
    byteExact: true,
    expected: null,
  })

  const bombStored = await createMahimWriter()
    .setApplication({ identifier: "mahim", payloadVersion: 1 })
    .addSection({
      type: SectionType.Asset,
      name: "bomb",
      compression: CompressionMethod.DeflateRaw,
      data: bombContent,
    })
    .finalize()
  fixtures.set("decompression-bomb.mahim", {
    bytes: bombStored,
    byteExact: false,
    expected: {
      header: expectedHeader(
        { applicationIdentifier: "mahim", sectionCount: 1 },
        bombStored.length,
      ),
      sections: [
        expectedSection({
          name: "bomb",
          type: SectionType.Asset,
          compression: CompressionMethod.DeflateRaw,
          uncompressedLength: bombContent.length,
        }),
      ],
    },
  })

  const withDigest = await createMahimWriter({ fileDigest: true })
    .setApplication({ identifier: "mahim", payloadVersion: 1 })
    .addSection({ type: SectionType.Metadata, name: "meta", data: withDigestMeta })
    .addSection({ type: SectionType.Asset, name: "asset", data: withDigestAsset })
    .finalize()
  fixtures.set("with-file-digest.mahim", {
    bytes: withDigest,
    byteExact: true,
    expected: {
      header: expectedHeader(
        {
          applicationIdentifier: "mahim",
          sectionCount: 2,
          fileDigestSha256: true,
        },
        withDigest.length,
      ),
      sections: [
        expectedSection({
          name: "meta",
          type: SectionType.Metadata,
          encoding: PayloadEncoding.Cbor,
          uncompressedLength: withDigestMeta.length,
        }),
        expectedSection({
          name: "asset",
          type: SectionType.Asset,
          uncompressedLength: withDigestAsset.length,
        }),
      ],
    },
  })

  const utf8Name = await createMahimWriter()
    .setApplication({ identifier: "com.example.tool", payloadVersion: 2 })
    .addSection({ type: SectionType.Asset, name: "вложение-データ", data: utf8Data })
    .finalize()
  fixtures.set("utf8-names.mahim", {
    bytes: utf8Name,
    byteExact: true,
    expected: {
      header: expectedHeader(
        {
          applicationIdentifier: "com.example.tool",
          applicationPayloadVersion: 2,
          sectionCount: 1,
        },
        utf8Name.length,
      ),
      sections: [
        expectedSection({
          name: "вложение-データ",
          type: SectionType.Asset,
          uncompressedLength: utf8Data.length,
        }),
      ],
    },
  })

  return fixtures
}
