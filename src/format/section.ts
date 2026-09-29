import {
  InvalidSectionDirectoryError,
  ResourceLimitError,
  UnsupportedEncodingError,
  UnsupportedCompressionError,
  UnsupportedFeatureError,
} from "../errors/index.js"
import {
  CompressionMethod,
  MAX_SECTION_NAME_LENGTH,
  PayloadEncoding,
  SECTION_FLAG_CRITICAL,
  SECTION_FLAG_OPTIONAL,
  SECTION_FLAG_RESERVED_MASK,
  SectionType,
  type ParserLimits,
} from "./constants.js"
import {
  readUint32LE,
  readUint64LE,
  readUint8,
  writeUint32LE,
  writeUint64LE,
  writeUint8,
} from "./primitives.js"

export interface SectionDescriptor {
  readonly index: number
  readonly type: number
  readonly version: number
  readonly payloadOffset: number
  readonly storedLength: number
  readonly uncompressedLength: number
  readonly checksum: number
  readonly encoding: number
  readonly compression: number
  readonly flags: number
  readonly optional: boolean
  readonly critical: boolean
  readonly applicationDefinedId: number
  readonly name: string
}

export interface SectionDescriptorInput {
  readonly type: number
  readonly version: number
  readonly payloadOffset: number
  readonly storedLength: number
  readonly uncompressedLength: number
  readonly checksum: number
  readonly encoding: number
  readonly compression: number
  readonly flags: number
  readonly applicationDefinedId: number
  readonly name: string
}

export function encodeSectionDescriptor(input: SectionDescriptorInput): Uint8Array {
  const bytes = new Uint8Array(48)
  writeUint32LE(bytes, 0, input.type)
  writeUint32LE(bytes, 4, input.version)
  writeUint64LE(bytes, 8, input.payloadOffset)
  writeUint64LE(bytes, 16, input.storedLength)
  writeUint64LE(bytes, 24, input.uncompressedLength)
  writeUint32LE(bytes, 32, input.checksum)
  writeUint8(bytes, 36, input.encoding)
  writeUint8(bytes, 37, input.compression)
  writeUint8(bytes, 38, input.flags & 0xff)
  writeUint8(bytes, 39, (input.flags >>> 8) & 0xff)
  writeUint32LE(bytes, 40, input.applicationDefinedId)
  const nameBytes = new TextEncoder().encode(input.name)
  writeUint32LE(bytes, 44, nameBytes.length)
  return bytes
}

export function decodeSectionDescriptor(
  bytes: Uint8Array,
  offset: number,
  index: number,
  limits: ParserLimits,
): SectionDescriptor {
  const type = readUint32LE(bytes, offset)
  const version = readUint32LE(bytes, offset + 4)
  const payloadOffset = readUint64LE(bytes, offset + 8)
  const storedLength = readUint64LE(bytes, offset + 16)
  const uncompressedLength = readUint64LE(bytes, offset + 24)
  const checksum = readUint32LE(bytes, offset + 32)
  const encoding = readUint8(bytes, offset + 36)
  const compression = readUint8(bytes, offset + 37)
  const flags = readUint8(bytes, offset + 38) | (readUint8(bytes, offset + 39) << 8)
  const applicationDefinedId = readUint32LE(bytes, offset + 40)
  const nameLength = readUint32LE(bytes, offset + 44)

  if (type === SectionType.Invalid) {
    throw new InvalidSectionDirectoryError(`section ${index} has invalid type 0`)
  }
  if (nameLength > MAX_SECTION_NAME_LENGTH) {
    throw new InvalidSectionDirectoryError(
      `section ${index} name length ${nameLength} exceeds the format maximum`,
    )
  }
  if (nameLength > limits.maxSectionNameLength) {
    throw new ResourceLimitError(
      `section ${index} name length ${nameLength} exceeds limit ${limits.maxSectionNameLength}`,
    )
  }
  if ((flags & SECTION_FLAG_RESERVED_MASK) !== 0) {
    throw new UnsupportedFeatureError(`section ${index} has unknown flag bits set`)
  }
  const optional = (flags & SECTION_FLAG_OPTIONAL) !== 0
  const critical = (flags & SECTION_FLAG_CRITICAL) !== 0
  if (optional === critical) {
    throw new InvalidSectionDirectoryError(
      `section ${index} must set exactly one of optional/critical`,
    )
  }
  if (encoding !== PayloadEncoding.Raw && encoding !== PayloadEncoding.Cbor && encoding !== PayloadEncoding.Utf8) {
    throw new UnsupportedEncodingError(encoding)
  }
  if (compression !== CompressionMethod.None && compression !== CompressionMethod.DeflateRaw) {
    throw new UnsupportedCompressionError(compression)
  }
  if (compression === CompressionMethod.None && uncompressedLength !== storedLength) {
    throw new InvalidSectionDirectoryError(
      `section ${index} uncompressed_length must equal stored_length when compression is none`,
    )
  }
  if (storedLength > limits.maxSectionStoredLength) {
    throw new ResourceLimitError(
      `section ${index} stored length ${storedLength} exceeds limit ${limits.maxSectionStoredLength}`,
    )
  }
  if (uncompressedLength > limits.maxSectionUncompressedLength) {
    throw new ResourceLimitError(
      `section ${index} uncompressed length ${uncompressedLength} exceeds limit ${limits.maxSectionUncompressedLength}`,
    )
  }
  return {
    index,
    type,
    version,
    payloadOffset,
    storedLength,
    uncompressedLength,
    checksum,
    encoding,
    compression,
    flags,
    optional,
    critical,
    applicationDefinedId,
    name: "",
  }
}

export function isCoreSectionType(type: number): boolean {
  return type <= 0x0000ffff
}

export function isApplicationSectionType(type: number): boolean {
  return type >= 0x00010000
}

export function isKnownCoreSectionType(type: number): boolean {
  return type >= SectionType.Metadata && type <= SectionType.Extension
}
