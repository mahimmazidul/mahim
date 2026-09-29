# ADR 0003: deflate_raw as the v1 compression method

Status: accepted

## Context

MAHIM supports optional per-section compression. Candidates for v1: none,
DEFLATE (raw or zlib-wrapped), Brotli, Zstandard.

## Decision

v1 defines exactly two compression methods: `none` (0) and `deflate_raw` (1) —
a raw DEFLATE stream per RFC 1951 with no zlib or gzip wrapper. Brotli and
Zstandard codes are left unassigned for future versions.

## Rationale

- **Availability**: `CompressionStream`/`DecompressionStream` with
  `deflate-raw` are standard web APIs in all modern browsers and Node.js 18+,
  so the core library stays dependency-free and browser-native.
- **Footprint**: Brotli is not available through the web compression API in
  browsers; adding it would require a heavy dependency or Node-only code.
  Zstandard has weaker universal runtime support.
- **Simplicity**: raw DEFLATE avoids wrapper bytes and is exactly what zip
  and png use per entry; the format already stores lengths and checksums, so
  zlib framing adds nothing.
- **Random access**: per-section compression preserves selective reading;
  whole-file compression is explicitly disallowed.

## Consequences

- Compressed output bytes depend on the platform's DEFLATE implementation
  (documented in docs/determinism.md); decompressed bytes are always
  identical.
- Readers must reject unknown methods with `UnsupportedCompressionError` and
  never fall back to treating them as `none`.
- Decompression is always bounded: declared size must match exactly, and
  configurable limits (size, optional ratio) are enforced while streaming, to
  block decompression bombs.
- Brotli/Zstandard may be assigned method codes 2/3 in a future minor version;
  old readers will reject such sections loudly (correct per the compatibility
  contract) or skip them when the section is OPTIONAL and unknown.
