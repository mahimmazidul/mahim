# Error catalog

MAHIM uses structured error types instead of generic failures. All errors
extend `MahimError` and carry a stable `code` string. Two semantic base
classes group them: `FormatError` (structural problems) and `IntegrityError`
(checksum/digest mismatches).

| Class | Code | Meaning |
|---|---|---|
| `InvalidMagicError` | `INVALID_MAGIC` | Bytes `[0,5)` are not `MAHIM` |
| `UnsupportedFormatVersionError` | `UNSUPPORTED_FORMAT_VERSION` | `format_major` is not supported |
| `MalformedHeaderError` | `MALFORMED_HEADER` | Header field constraints violated |
| `InvalidApplicationIdentifierError` | `INVALID_APPLICATION_IDENTIFIER` | Identifier grammar or length violated |
| `MalformedUtf8Error` | `MALFORMED_UTF8` | Invalid UTF-8 in a string field |
| `FileLengthMismatchError` | `FILE_LENGTH_MISMATCH` | `file_length` smaller than actual size (appended garbage) |
| `TruncatedFileError` | `TRUNCATED_FILE` | Input shorter than declared `file_length` |
| `InvalidSectionDirectoryError` | `INVALID_SECTION_DIRECTORY` | Directory/count/name-table/descriptor consistency violated |
| `SectionBoundsError` | `SECTION_BOUNDS` | Payload range outside the payload region |
| `SectionOverlapError` | `SECTION_OVERLAP` | Payload ranges overlap |
| `MalformedSectionError` | `MALFORMED_SECTION` | Decompression failed or produced the wrong size |
| `CborDecodeError` | `CBOR_DECODE` | Malformed or non-canonical CBOR |
| `UnsupportedFeatureError` | `UNSUPPORTED_FEATURE` | Unknown critical section or unknown flag bit |
| `SectionNotFoundError` | `SECTION_NOT_FOUND` | Lookup by name/index/id matched nothing |
| `HeaderChecksumError` | `HEADER_CHECKSUM_MISMATCH` | Header CRC32C failed |
| `ChecksumMismatchError` | `CHECKSUM_MISMATCH` | Section payload CRC32C failed |
| `FileDigestMismatchError` | `FILE_DIGEST_MISMATCH` | Optional SHA-256 file digest failed |
| `UnsupportedEncodingError` | `UNSUPPORTED_ENCODING` | Unknown payload encoding value |
| `UnsupportedCompressionError` | `UNSUPPORTED_COMPRESSION` | Unknown compression method value |
| `ResourceLimitError` | `RESOURCE_LIMIT` | Configured parser limit exceeded (sizes, counts, ratios) |

Every error carries structured fields where useful, e.g.
`UnsupportedFormatVersionError.major/minor`,
`FileLengthMismatchError.declaredLength/actualLength`,
`UnsupportedCompressionError.compression`.

## Behavior contract

- Parsing never throws non-`MahimError` exceptions for untrusted input (the
  fuzz smoke tests enforce this).
- Integrity failures are reported either as thrown errors (reads) or as a
  `VerificationReport` (`reader.verify()`), depending on the call.
- The CLI prints `error: <Name>: <message>` and exits with code 1; usage
  errors exit with code 2.
