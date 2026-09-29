# Security model

MAHIM v1 files are frequently produced and consumed by different parties, and
parsers must treat every file as untrusted input. This document states
precisely what MAHIM provides and what it deliberately does not.

## What MAHIM v1 provides

### Structural validation

Every header field, directory entry, and payload range is validated before it
is used: magic, versions, lengths, counts, offsets, overlaps, reserved fields,
UTF-8 validity, flag combinations, and directory consistency. A file that
fails any check is rejected with a precise structured error — never partially
trusted.

### Accidental corruption detection

- CRC32C over the header (with the checksum field zeroed).
- CRC32C over every section payload's stored bytes, verified before use.
- `file_length` must match the physical size exactly, detecting truncation
  and appended garbage.

CRC32C detects storage errors and accidental damage. It is not a cryptographic
authenticator.

### Optional strong integrity

The `FILE_DIGEST_SHA256` header flag adds a whole-file SHA-256 digest for
distribution and archival verification. It is optional because it requires
reading the entire file and is not needed for everyday corruption detection.

### Safe bounds and resource handling

Configurable limits bound header size, section count, name lengths, directory
size, stored and decompressed sizes, and (optionally) compression ratios.
Decompression is streamed and aborts at the declared size or the configured
limit; output buffers are never allocated from untrusted metadata without
checks.

### Extension safety

Unknown sections marked OPTIONAL are skipped. Unknown sections marked
CRITICAL, and unknown reserved flag bits, fail loudly with
`UnsupportedFeatureError` — a reader never silently misinterprets a file it
does not fully understand.

## What MAHIM v1 does NOT provide

| Property | Status | Notes |
|---|---|---|
| Confidentiality | Not provided | No encryption. Anyone with the file can read it. |
| Authenticity | Not provided | No signatures. An attacker with write access can modify content and recompute CRC32C/SHA-256. |
| Freshness/replay protection | Not provided | Not a transport protocol. |
| Malware protection | Not provided | Payloads are arbitrary bytes. |
| Semantic validity of application data | Application's responsibility | A structurally valid file can contain semantically invalid or hostile application payloads. |

Cryptographic signatures and encryption are intentionally out of scope for v1.
Reserved flag bits and CRITICAL extension sections are the designated
extension points for adding them later without breaking v1 readers. No custom
cryptography will be invented; future work must use standard, reviewed
mechanisms defined in separate versioned specifications.

## Parser hardening checklist (reference implementation)

- all integer arithmetic overflow-checked (`checkedAdd`, safe-integer uint64)
- offsets verified against actual source length (Uint8Array and Blob alike)
- overlap detection across all payload ranges
- header checksum verified before header-derived offsets are used
- decompression size caps enforced during streaming, not only from metadata
- strict UTF-8 decoding (fatal mode) for all string fields
- strict canonical CBOR validation for metadata
- fuzz smoke tests assert mutated inputs only ever produce structured
  `MahimError`s, never crashes or foreign exceptions

## Guidance for applications

1. Validate application payload schemas yourself; treat them as untrusted.
2. Use CRITICAL only for sections that must be understood for correct
   interpretation; prefer OPTIONAL for additive data.
3. If you need authenticity (e.g. distributing study files), add a trusted
   outer layer (signed manifest, TLS delivery, code signing) — MAHIM v1 will
   not do this for you.
4. Configure parser limits appropriate for your deployment; the defaults are
   deliberately permissive for large assets but finite.
