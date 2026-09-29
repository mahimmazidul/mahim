# Determinism

MAHIM is designed for reproducible output: given the same inputs and options,
a conformant writer produces byte-identical files. This document defines the
guarantee precisely.

## What is guaranteed

Two writes with identical:

- application identifier and application payload version,
- section list: order, types, versions, data bytes, encodings, compression
  choices, flags, application-defined ids, and names,
- writer options (e.g. presence of the SHA-256 file digest),
- compression implementation,

produce identical output bytes.

The format injects no randomness, timestamps, counters, UUIDs, or
process-unique values. If an application wants timestamps, they are ordinary
section content and naturally affect the output.

## How determinism is achieved

1. **Fixed layout**: header at 0, directory immediately after the header,
   payloads immediately after the directory in insertion order, no gaps, no
   padding, optional digest last.
2. **No reordering**: directory order equals insertion order and is
   significant. MAHIM never sorts sections.
3. **Zeroed reserved fields**: every reserved byte and bit is written as zero.
4. **Canonical CBOR**: metadata uses the MAHIM Canonical CBOR profile
   (spec Appendix A) — shortest-form integers and lengths, definite lengths
   only, map keys sorted by encoded key bytes. The canonical map ordering is
   independent of JavaScript object key insertion order.
5. **Fixed checksums**: CRC32C is fully specified; SHA-256 is standard.

## The compression caveat

DEFLATE output bytes depend on the compressor implementation and its
settings/version. Byte-identical output is guaranteed only when the same
deflate implementation is used (for example the same browser engine or Node.js
zlib build). All conformant decoders produce identical *decompressed* bytes
from any valid stream.

For maximum cross-implementation reproducibility, write data sections with
`compression: none`. Compressed fixtures in this repository are verified
semantically (round-trip content), not byte-for-byte, for exactly this reason;
uncompressed golden fixtures are byte-verified.

## Golden fixtures

`npm run fixtures` regenerates `fixtures/` from `tests/helpers/fixture-content.ts`.
Fixtures marked byte-exact are compared against fresh builds in every test run,
so accidental nondeterminism fails CI immediately.

## Recommended application ordering

Semantics must not depend on physical placement, but applications should
write sections in this canonical order for predictability:

1. core metadata
2. application metadata / manifest
3. application payload
4. assets
5. extensions
