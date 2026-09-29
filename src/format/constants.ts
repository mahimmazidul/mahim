export const MAHIM_MAGIC_TEXT = "MAHIM"

export const MAHIM_MAGIC: Readonly<Uint8Array> = new Uint8Array([
  0x4d, 0x41, 0x48, 0x49, 0x4d,
])

export const FORMAT_MAJOR = 1
export const FORMAT_MINOR = 0

export interface FormatVersion {
  readonly major: number
  readonly minor: number
}

export const FORMAT_VERSION: FormatVersion = Object.freeze({
  major: FORMAT_MAJOR,
  minor: FORMAT_MINOR,
})

export const HEADER_FIXED_LENGTH = 56
export const SECTION_DESCRIPTOR_LENGTH = 48
export const FILE_DIGEST_LENGTH = 32
export const MAX_APPLICATION_IDENTIFIER_LENGTH = 255
export const MAX_SECTION_NAME_LENGTH = 255

export const HEADER_FLAG_FILE_DIGEST_SHA256 = 0x01
export const HEADER_FLAG_RESERVED_MASK = 0xfe

export const SECTION_FLAG_OPTIONAL = 0x0001
export const SECTION_FLAG_CRITICAL = 0x0002
export const SECTION_FLAG_RESERVED_MASK = 0xfffc

export const SectionType = Object.freeze({
  Invalid: 0,
  Metadata: 1,
  ApplicationPayload: 2,
  Asset: 3,
  Index: 4,
  Extension: 5,
})

export const SECTION_TYPE_APPLICATION_MIN = 0x00010000
export const SECTION_TYPE_CORE_RESERVED_MAX = 0x0000ffff

export const PayloadEncoding = Object.freeze({
  Raw: 0,
  Cbor: 1,
  Utf8: 2,
})

export const CompressionMethod = Object.freeze({
  None: 0,
  DeflateRaw: 1,
})

export const ChecksumMethod = Object.freeze({
  Crc32c: 0,
  Sha256: 1,
})

export type ApplicationIdentifier = string

export interface ParserLimits {
  readonly maxHeaderLength: number
  readonly maxApplicationIdentifierLength: number
  readonly maxSectionCount: number
  readonly maxSectionNameLength: number
  readonly maxSectionDirectoryLength: number
  readonly maxSectionStoredLength: number
  readonly maxSectionUncompressedLength: number
  readonly maxDecompressionRatio: number
}

export const DEFAULT_LIMITS: ParserLimits = Object.freeze({
  maxHeaderLength: 4096,
  maxApplicationIdentifierLength: MAX_APPLICATION_IDENTIFIER_LENGTH,
  maxSectionCount: 65536,
  maxSectionNameLength: MAX_SECTION_NAME_LENGTH,
  maxSectionDirectoryLength: 33554432,
  maxSectionStoredLength: 1073741824,
  maxSectionUncompressedLength: 1073741824,
  maxDecompressionRatio: 0,
})

export const APPLICATION_IDENTIFIER_PATTERN = /^[a-z][a-z0-9._-]*$/

export function isValidApplicationIdentifier(value: string): boolean {
  if (value.length === 0) {
    return false
  }
  const byteLength = utf8ByteLength(value)
  if (byteLength > MAX_APPLICATION_IDENTIFIER_LENGTH) {
    return false
  }
  return APPLICATION_IDENTIFIER_PATTERN.test(value)
}

export function isValidSectionName(value: string): boolean {
  if (value.length === 0) {
    return true
  }
  return utf8ByteLength(value) <= MAX_SECTION_NAME_LENGTH
}

function utf8ByteLength(value: string): number {
  let total = 0
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x80) {
      total += 1
    } else if (code < 0x800) {
      total += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      total += 4
      i += 1
    } else {
      total += 3
    }
  }
  return total
}
