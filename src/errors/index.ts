export class MahimError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = new.target.name
    this.code = code
  }
}

export class FormatError extends MahimError {
  constructor(code: string, message: string) {
    super(code, message)
  }
}

export class IntegrityError extends MahimError {
  constructor(code: string, message: string) {
    super(code, message)
  }
}

export class InvalidMagicError extends FormatError {
  constructor(message = "not a MAHIM file: magic bytes do not match") {
    super("INVALID_MAGIC", message)
  }
}

export class UnsupportedFormatVersionError extends FormatError {
  readonly major: number
  readonly minor: number

  constructor(major: number, minor: number) {
    super(
      "UNSUPPORTED_FORMAT_VERSION",
      `unsupported MAHIM format version ${major}.${minor}`,
    )
    this.major = major
    this.minor = minor
  }
}

export class MalformedHeaderError extends FormatError {
  constructor(message = "malformed MAHIM header") {
    super("MALFORMED_HEADER", message)
  }
}

export class InvalidApplicationIdentifierError extends FormatError {
  constructor(message = "invalid application identifier") {
    super("INVALID_APPLICATION_IDENTIFIER", message)
  }
}

export class MalformedUtf8Error extends FormatError {
  constructor(message = "malformed UTF-8 in string field") {
    super("MALFORMED_UTF8", message)
  }
}

export class FileLengthMismatchError extends FormatError {
  readonly declaredLength: number
  readonly actualLength: number

  constructor(declaredLength: number, actualLength: number) {
    super(
      "FILE_LENGTH_MISMATCH",
      `file_length ${declaredLength} does not match actual size ${actualLength}`,
    )
    this.declaredLength = declaredLength
    this.actualLength = actualLength
  }
}

export class TruncatedFileError extends FormatError {
  constructor(message = "file is truncated") {
    super("TRUNCATED_FILE", message)
  }
}

export class InvalidSectionDirectoryError extends FormatError {
  constructor(message = "invalid section directory") {
    super("INVALID_SECTION_DIRECTORY", message)
  }
}

export class SectionBoundsError extends FormatError {
  constructor(message = "section payload out of bounds") {
    super("SECTION_BOUNDS", message)
  }
}

export class SectionOverlapError extends FormatError {
  constructor(message = "section payload ranges overlap") {
    super("SECTION_OVERLAP", message)
  }
}

export class MalformedSectionError extends FormatError {
  constructor(message = "malformed section payload") {
    super("MALFORMED_SECTION", message)
  }
}

export class CborDecodeError extends FormatError {
  constructor(message = "malformed CBOR data") {
    super("CBOR_DECODE", message)
  }
}

export class UnsupportedFeatureError extends FormatError {
  constructor(message = "unsupported feature") {
    super("UNSUPPORTED_FEATURE", message)
  }
}

export class SectionNotFoundError extends MahimError {
  constructor(message = "section not found") {
    super("SECTION_NOT_FOUND", message)
  }
}

export class HeaderChecksumError extends IntegrityError {
  constructor(message = "header checksum mismatch") {
    super("HEADER_CHECKSUM_MISMATCH", message)
  }
}

export class ChecksumMismatchError extends IntegrityError {
  constructor(message = "section payload checksum mismatch") {
    super("CHECKSUM_MISMATCH", message)
  }
}

export class FileDigestMismatchError extends IntegrityError {
  constructor(message = "file digest mismatch") {
    super("FILE_DIGEST_MISMATCH", message)
  }
}

export class UnsupportedEncodingError extends MahimError {
  readonly encoding: number

  constructor(encoding: number) {
    super(
      "UNSUPPORTED_ENCODING",
      `unsupported payload encoding ${encoding}`,
    )
    this.encoding = encoding
  }
}

export class UnsupportedCompressionError extends MahimError {
  readonly compression: number

  constructor(compression: number) {
    super(
      "UNSUPPORTED_COMPRESSION",
      `unsupported compression method ${compression}`,
    )
    this.compression = compression
  }
}

export class ResourceLimitError extends MahimError {
  constructor(message = "parser resource limit exceeded") {
    super("RESOURCE_LIMIT", message)
  }
}
