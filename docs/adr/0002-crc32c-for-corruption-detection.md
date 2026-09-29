# ADR 0002: CRC32C for corruption detection

Status: accepted

## Context

Every section needs a fast integrity field that detects accidental corruption.
Candidates: CRC32, CRC32C (Castagnoli), xxHash, SHA-256.

## Decision

Use CRC32C (polynomial 0x1EDC6F41, reflected 0x82F63B78) for the header
checksum and every section payload checksum. Optionally use SHA-256 as a
whole-file digest when the writer requests it.

## Rationale

- CRC32C has an excellent error-detection profile for random corruption
  (better than classic CRC-32) and is standardized in multiple RFCs.
- It is trivial to implement in any language (~20 lines with a table) with no
  dependency footprint, unlike xxHash which is larger and has several
  incompatible variants.
- Hardware acceleration exists on many platforms (SSE4.2/ARMv8), so the
  fast path is fast and the reference pure-JS implementation is portable.
- SHA-256 is kept optional: it requires reading the whole file and is about
  two orders of magnitude slower; everyday reads do not need cryptographic
  integrity.

Checksums cover the **stored** (post-compression) bytes so they can be
verified before any decompressor runs, and so corruption is caught even when
a section is never decompressed.

## Consequences

- Accidental corruption is detected cheaply on every read.
- Deliberate tampering is out of scope for CRC32C; applications needing
  authenticity must add signatures at a layer above MAHIM (future extension
  points are reserved).
- The empty payload checksum is defined as `0x00000000`, matching the
  standard CRC32C of zero-length input.
