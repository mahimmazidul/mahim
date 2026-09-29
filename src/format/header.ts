import {
  HeaderChecksumError,
  FileLengthMismatchError,
  InvalidApplicationIdentifierError,
  InvalidMagicError,
  MalformedHeaderError,
  ResourceLimitError,
  TruncatedFileError,
  UnsupportedFeatureError,
  UnsupportedFormatVersionError,
} from "../errors/index.js"
import { crc32c } from "../checksum/crc32c.js"
import {
  FORMAT_MAJOR,
  FORMAT_MINOR,
  HEADER_FIXED_LENGTH,
  HEADER_FLAG_FILE_DIGEST_SHA256,
  HEADER_FLAG_RESERVED_MASK,
  isValidApplicationIdentifier,
  MAHIM_MAGIC,
  MAHIM_MAGIC_TEXT,
  type ApplicationIdentifier,
  type FormatVersion,
  type ParserLimits,
} from "./constants.js"
import {
  decodeUtf8,
  encodeUtf8,
  readUint32LE,
  readUint64LE,
  readUint8,
  writeUint32LE,
  writeUint64LE,
  writeUint8,
} from "./primitives.js"

export interface MahimHeader {
  readonly magic: typeof MAHIM_MAGIC_TEXT
  readonly formatVersion: FormatVersion
  readonly headerFlags: number
  readonly headerLength: number
  readonly applicationIdentifier: ApplicationIdentifier
  readonly applicationPayloadVersion: number
  readonly sectionCount: number
  readonly sectionDirectoryOffset: number
  readonly sectionDirectoryLength: number
  readonly fileLength: number
  readonly headerChecksum: number
  readonly fileDigestSha256: boolean
}

export interface EncodeHeaderInput {
  readonly applicationIdentifier: ApplicationIdentifier
  readonly applicationPayloadVersion: number
  readonly sectionCount: number
  readonly sectionDirectoryOffset: number
  readonly sectionDirectoryLength: number
  readonly fileLength: number
  readonly fileDigestSha256: boolean
}

export function encodeHeader(input: EncodeHeaderInput): Uint8Array {
  const identifierBytes = encodeUtf8(input.applicationIdentifier)
  if (!isValidApplicationIdentifier(input.applicationIdentifier)) {
    throw new InvalidApplicationIdentifierError(
      `invalid application identifier ${JSON.stringify(input.applicationIdentifier)}`,
    )
  }
  const headerLength = HEADER_FIXED_LENGTH + identifierBytes.length
  const bytes = new Uint8Array(headerLength)
  bytes.set(MAHIM_MAGIC, 0)
  writeUint8(bytes, 5, FORMAT_MAJOR)
  writeUint8(bytes, 6, FORMAT_MINOR)
  writeUint8(bytes, 7, input.fileDigestSha256 ? HEADER_FLAG_FILE_DIGEST_SHA256 : 0)
  writeUint32LE(bytes, 8, headerLength)
  writeUint32LE(bytes, 12, 0)
  writeUint8(bytes, 12, identifierBytes.length)
  writeUint8(bytes, 13, 0)
  writeUint32LE(bytes, 14, input.applicationPayloadVersion)
  writeUint32LE(bytes, 18, input.sectionCount)
  writeUint64LE(bytes, 22, input.sectionDirectoryOffset)
  writeUint64LE(bytes, 30, input.sectionDirectoryLength)
  writeUint64LE(bytes, 38, input.fileLength)
  writeUint32LE(bytes, 46, 0)
  for (let i = 50; i < HEADER_FIXED_LENGTH; i += 1) {
    bytes[i] = 0
  }
  bytes.set(identifierBytes, HEADER_FIXED_LENGTH)
  writeUint32LE(bytes, 46, crc32c(bytes))
  return bytes
}

export function decodeHeader(
  fileBytes: Uint8Array,
  actualFileLength: number,
  limits: ParserLimits,
): MahimHeader {
  if (fileBytes.length < 5) {
    throw new InvalidMagicError("input too short to contain MAHIM magic")
  }
  for (let i = 0; i < MAHIM_MAGIC.length; i += 1) {
    if (fileBytes[i] !== MAHIM_MAGIC[i]) {
      throw new InvalidMagicError()
    }
  }
  if (fileBytes.length < HEADER_FIXED_LENGTH) {
    throw new TruncatedFileError("input shorter than the fixed header")
  }
  const formatMajor = readUint8(fileBytes, 5)
  const formatMinor = readUint8(fileBytes, 6)
  if (formatMajor !== FORMAT_MAJOR) {
    throw new UnsupportedFormatVersionError(formatMajor, formatMinor)
  }
  const headerFlags = readUint8(fileBytes, 7)
  if ((headerFlags & HEADER_FLAG_RESERVED_MASK) !== 0) {
    throw new UnsupportedFeatureError("unknown header flag bits are set")
  }
  const headerLength = readUint32LE(fileBytes, 8)
  const identifierLength = readUint16Safe(fileBytes, 12)
  if (headerLength !== HEADER_FIXED_LENGTH + identifierLength) {
    throw new MalformedHeaderError(
      `header_length ${headerLength} does not match 56 + application_identifier_length ${identifierLength}`,
    )
  }
  if (headerLength > limits.maxHeaderLength) {
    throw new ResourceLimitError(
      `header_length ${headerLength} exceeds limit ${limits.maxHeaderLength}`,
    )
  }
  if (identifierLength < 1 || identifierLength > limits.maxApplicationIdentifierLength) {
    throw new InvalidApplicationIdentifierError(
      `application identifier length ${identifierLength} out of range`,
    )
  }
  if (fileBytes.length < headerLength) {
    throw new TruncatedFileError("input shorter than header_length")
  }
  const storedChecksum = readUint32LE(fileBytes, 46)
  const checksumCopy = fileBytes.slice(0, headerLength)
  writeUint32LE(checksumCopy, 46, 0)
  const computedChecksum = crc32c(checksumCopy)
  if (computedChecksum !== storedChecksum) {
    throw new HeaderChecksumError()
  }
  for (let i = 50; i < HEADER_FIXED_LENGTH; i += 1) {
    if (fileBytes[i] !== 0) {
      throw new MalformedHeaderError("reserved header bytes must be zero")
    }
  }
  const applicationIdentifier = decodeUtf8(
    fileBytes.slice(HEADER_FIXED_LENGTH, HEADER_FIXED_LENGTH + identifierLength),
  )
  if (!isValidApplicationIdentifier(applicationIdentifier)) {
    throw new InvalidApplicationIdentifierError(
      `invalid application identifier ${JSON.stringify(applicationIdentifier)}`,
    )
  }
  const applicationPayloadVersion = readUint32LE(fileBytes, 14)
  const sectionCount = readUint32LE(fileBytes, 18)
  const sectionDirectoryOffset = readUint64LE(fileBytes, 22)
  const sectionDirectoryLength = readUint64LE(fileBytes, 30)
  const fileLength = readUint64LE(fileBytes, 38)
  if (fileLength > actualFileLength) {
    throw new TruncatedFileError(
      `file_length ${fileLength} exceeds actual size ${actualFileLength}`,
    )
  }
  if (fileLength < actualFileLength) {
    throw new FileLengthMismatchError(fileLength, actualFileLength)
  }
  if (sectionCount > limits.maxSectionCount) {
    throw new ResourceLimitError(
      `section count ${sectionCount} exceeds limit ${limits.maxSectionCount}`,
    )
  }
  const digestSize = (headerFlags & HEADER_FLAG_FILE_DIGEST_SHA256) !== 0 ? 32 : 0
  if (fileLength < headerLength + digestSize) {
    throw new MalformedHeaderError("file_length too small for header and digest")
  }
  if (sectionDirectoryOffset < headerLength) {
    throw new MalformedHeaderError(
      "section directory overlaps the header",
    )
  }
  if (sectionDirectoryLength > limits.maxSectionDirectoryLength) {
    throw new ResourceLimitError(
      `section directory length ${sectionDirectoryLength} exceeds limit ${limits.maxSectionDirectoryLength}`,
    )
  }
  if (sectionDirectoryOffset + sectionDirectoryLength > fileLength - digestSize) {
    throw new MalformedHeaderError("section directory exceeds payload region")
  }
  return {
    magic: MAHIM_MAGIC_TEXT,
    formatVersion: { major: formatMajor, minor: formatMinor },
    headerFlags,
    headerLength,
    applicationIdentifier,
    applicationPayloadVersion,
    sectionCount,
    sectionDirectoryOffset,
    sectionDirectoryLength,
    fileLength,
    headerChecksum: storedChecksum,
    fileDigestSha256: (headerFlags & HEADER_FLAG_FILE_DIGEST_SHA256) !== 0,
  }
}

function readUint16Safe(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}
