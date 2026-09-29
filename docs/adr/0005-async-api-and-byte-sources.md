# ADR 0005: async-first API with pluggable byte sources

Status: accepted

## Context

The library must run in browsers and Node.js. Browser inputs include
`Blob`/`File` (asynchronous reads via slicing), and compression uses the
platform `CompressionStream`/`DecompressionStream` (asynchronous). Node has
synchronous zlib, but core must not depend on it.

## Decision

- All I/O and compression operations are async (`openMahim`, `getSection`,
  `verify`, `finalize`).
- Inputs are abstracted as `ByteSource` with `read(offset, length)`:
  `BytesSource` for `Uint8Array`/`ArrayBuffer`, `BlobSource` for `Blob`/`File`.
- Pure computation (checksums, CBOR, primitives) stays synchronous.

## Rationale

- A single async surface beats a dual sync/async API in complexity and
  correctness; the sync special case would still need async for Blob and
  CompressionStream.
- `ByteSource` isolates the parser from the backing store, which also makes
  future range-HTTP sources straightforward and keeps fuzzing simple
  (mutate bytes, reuse everything).
- Selective reads: `getSection` fetches only that section's byte range, so a
  `Blob`-backed reader never materializes the whole file.

## Consequences

- Callers in fully synchronous contexts must await; acceptable for a modern
  library, and Node file helpers (`mahim/node`) are async as well.
- The writer compresses sections sequentially inside `finalize()` to keep
  output layout deterministic and error handling simple.
