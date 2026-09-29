export {
  MahimError,
  FormatError,
  IntegrityError,
  InvalidMagicError,
  UnsupportedFormatVersionError,
  MalformedHeaderError,
  InvalidApplicationIdentifierError,
  MalformedUtf8Error,
  FileLengthMismatchError,
  TruncatedFileError,
  InvalidSectionDirectoryError,
  SectionBoundsError,
  SectionOverlapError,
  MalformedSectionError,
  CborDecodeError,
  UnsupportedFeatureError,
  SectionNotFoundError,
  HeaderChecksumError,
  ChecksumMismatchError,
  FileDigestMismatchError,
  UnsupportedEncodingError,
  UnsupportedCompressionError,
  ResourceLimitError,
} from "./errors/index.js"

export {
  MAHIM_MAGIC,
  MAHIM_MAGIC_TEXT,
  FORMAT_MAJOR,
  FORMAT_MINOR,
  FORMAT_VERSION,
  HEADER_FIXED_LENGTH,
  SECTION_DESCRIPTOR_LENGTH,
  FILE_DIGEST_LENGTH,
  MAX_APPLICATION_IDENTIFIER_LENGTH,
  MAX_SECTION_NAME_LENGTH,
  HEADER_FLAG_FILE_DIGEST_SHA256,
  SECTION_FLAG_OPTIONAL,
  SECTION_FLAG_CRITICAL,
  SECTION_TYPE_APPLICATION_MIN,
  SectionType,
  PayloadEncoding,
  CompressionMethod,
  ChecksumMethod,
  DEFAULT_LIMITS,
  isValidApplicationIdentifier,
  isValidSectionName,
  type ApplicationIdentifier,
  type FormatVersion,
  type ParserLimits,
} from "./format/constants.js"

export type { MahimHeader, EncodeHeaderInput } from "./format/header.js"
export { encodeHeader, decodeHeader } from "./format/header.js"
export type {
  SectionDescriptor,
  SectionDescriptorInput,
} from "./format/section.js"
export { encodeSectionDescriptor, decodeSectionDescriptor } from "./format/section.js"
export type { SectionDirectory } from "./format/directory.js"
export {
  encodeSectionDirectory,
  decodeSectionDirectory,
  directoryLengthFor,
} from "./format/directory.js"
export type { CborValue, DecodeCborOptions } from "./encoding/cbor.js"
export { encodeCbor, decodeCbor } from "./encoding/cbor.js"
export { crc32c } from "./checksum/crc32c.js"
export { sha256 } from "./checksum/sha256.js"
export type { BinaryInput, ByteSource } from "./io/byte-source.js"
export { BytesSource, BlobSource, byteSourceFrom } from "./io/byte-source.js"

export type {
  ApplicationSpec,
  SectionInput,
  MahimWriterOptions,
  MahimWriter,
} from "./writer/writer.js"
export { createMahimWriter } from "./writer/writer.js"

export type {
  MahimReader,
  OpenOptions,
  SectionQuery,
  SectionVerification,
  VerificationReport,
  VerifyOptions,
} from "./reader/reader.js"
export { openMahim, parseMahimHeader } from "./reader/reader.js"

export type { FileLayout } from "./validation/layout.js"
export { validateSectionLayout } from "./validation/layout.js"

export {
  compressPayload,
  decompressPayload,
  type DecompressionLimits,
} from "./compression/index.js"

export {
  concatBytes,
  bytesEqual,
  readUint8,
  readUint16LE,
  readUint32LE,
  readUint64LE,
  writeUint8,
  writeUint16LE,
  writeUint32LE,
  writeUint64LE,
  encodeUtf8,
  decodeUtf8,
} from "./format/primitives.js"
