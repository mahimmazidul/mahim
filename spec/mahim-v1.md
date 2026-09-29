# MAHIM Binary Container Format — Specification v1.0

Status: Stable  
Format major version: 1  
Format minor version: 0  
Reference implementation: TypeScript (`src/`, this repository)

---

## 1. Introduction

MAHIM is a lightweight, deterministic, extensible binary container format for
storing typed sections of binary and structured data inside a single
self-describing file. It is designed to be:

- fast and safe to parse, including from untrusted input;
- streaming- and partial-read friendly;
- portable across languages and runtimes (browsers, servers, embedded tooling);
- deterministic to write, where practical;
- extensible without breaking older readers.

MAHIM is intentionally independent of archive formats such as ZIP and TAR. It
does not model a filesystem, does not store filenames or directory trees, and
does not require a central directory of named files. Instead, a MAHIM file is a
sequence of typed *sections*, discovered through a compact section directory.

This document is the authoritative definition of the format. An implementation
may be written in any language using only this specification. The TypeScript
implementation in this repository is a *reference implementation*, not the
specification itself.

### 1.1 Design goals

| Goal | How v1 achieves it |
|---|---|
| Lightweight | Fixed-size header (56 bytes + identifier), 48-byte section descriptors, zero mandatory compression or cryptography |
| Deterministic | Fixed layout rules, canonical CBOR metadata, no timestamps or randomness injected by the format |
| Portable | Explicit little-endian integers, explicit widths, UTF-8 strings, no architecture-dependent sizes |
| Fast to parse | Section directory enables O(1) lookup; only requested sections are read |
| Safe to parse | Mandatory bounds, overlap, overflow, and resource-limit validation (Section 12) |
| Streaming-friendly | Directory is adjacent to the header; payloads are independently compressed and checksummed |
| Extensible | Application section-type namespace, optional/critical section flags, reserved flag bits |
| Versioned | Format major/minor versions kept strictly separate from application payload versions |

### 1.2 Terminology

- **File**: one complete MAHIM byte sequence.
- **Header**: the fixed-layout record at offset 0 that identifies the file.
- **Application identifier**: a short stable string naming the owning/consumer application.
- **Application payload version**: a version number owned entirely by the application.
- **Section**: one typed payload record (bytes) with a descriptor.
- **Section descriptor**: fixed-size record describing one section.
- **Section directory**: the array of section descriptors followed by the section name table.
- **Section payload**: the stored bytes of a section (possibly compressed).
- **Stored length**: size of the payload as it appears in the file (post-compression).
- **Uncompressed length**: size of the payload after decompression. Equals stored length when no compression is applied.
- **Core**: concepts defined by MAHIM itself, independent of any application.
- **Application-defined**: concepts owned by the application identified in the header.
- **Reader**: any software that parses MAHIM files.
- **Writer**: any software that produces MAHIM files.

### 1.3 Conventions

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT,
RECOMMENDED, MAY, and OPTIONAL are to be interpreted as described in RFC 2119.

All diagrams and tables describe byte sequences in file order. Multi-byte
integers are little-endian (Section 3).

---

## 2. File overview

A MAHIM v1 file consists of five logical regions in this exact order:

```
+--------------------------------------+ offset 0
| Header                               |  header_length bytes
+--------------------------------------+
| Section directory                    |  section_directory_length bytes
|   - section descriptors (48 B each)  |
|   - section name table               |
+--------------------------------------+
| Section payload 0                    |
| Section payload 1                    |
| ...                                  |
| Section payload (section_count - 1)  |
+--------------------------------------+
| File digest (OPTIONAL)               |  32 bytes, present iff header flag set
+--------------------------------------+ file_length
```

Rules:

1. The header begins at offset 0 and occupies `header_length` bytes.
2. The section directory MUST lie entirely after the header and before every
   section payload. Writers SHOULD place it immediately after the header
   (`section_directory_offset == header_length`); readers MUST NOT require this.
3. Each section payload occupies the byte range
   `[payload_offset, payload_offset + stored_length)`.
4. Payload ranges MUST NOT overlap each other, the header, the directory, or
   the optional file digest.
5. Gaps between regions are permitted and readers MUST tolerate them.
6. Zero-length section payloads are permitted.
7. If the `FILE_DIGEST_SHA256` header flag is set, the final 32 bytes of the
   file are the file digest (Section 10.3).

A file MUST be completely described by its header and section directory; a
reader MUST be able to locate every section without scanning the file.

---

## 3. Byte order and primitive types

All fixed-width numeric fields are unsigned integers in **little-endian** byte
order, unless a field is explicitly documented as raw bytes. This applies on
every architecture. Readers and writers MUST NOT use architecture-dependent
integer sizes.

| Type | Size | Encoding |
|---|---|---|
| uint8 | 1 byte | unsigned integer |
| uint16 | 2 bytes | unsigned integer, little-endian |
| uint32 | 4 bytes | unsigned integer, little-endian |
| uint64 | 8 bytes | unsigned integer, little-endian |
| bytes\[N\] | N bytes | raw bytes, no encoding |
| utf8\[N\] | N bytes | UTF-8 encoded string (RFC 3629), no terminator, no BOM |

Integer fields MUST use their full range; no sign extension occurs. A uint64
value MUST fit in the range `[0, 2^64 - 1]`. Readers SHOULD compute with
overflow-safe arithmetic when deriving ranges from untrusted values (Section 12).

All UTF-8 string fields MUST be valid UTF-8. Invalid UTF-8 MUST cause the file
to be rejected. Strings MUST NOT contain a byte-order mark. Embedded NUL code
points are technically representable but SHOULD NOT be used.

---

## 4. Magic bytes

The first five bytes of every MAHIM file are the ASCII magic signature:

```
4D 41 48 49 4D
```

which is the ASCII string `MAHIM` (`0x4D 0x41 0x48 0x49 0x4D`).

The magic is immediately followed by `format_major` (1 byte), which acts as the
version delimiter. A detector therefore identifies MAHIM by checking bytes
`[0, 5)` for the exact magic and byte `5` for a plausible major version.

The file extension `.mahim` is conventional only. Identification MUST be based
on the magic bytes. A file renamed from `example.mahim` to `example.bin` MUST
still be identifiable as MAHIM from its contents. Readers MUST NOT rely on file
extensions or media types to decide whether data is MAHIM.

---

## 5. Header

The header is a semi-fixed structure: a fixed 56-byte prefix followed by the
UTF-8 application identifier. `header_length = 56 + application_identifier_length`.

### 5.1 Header layout

| Offset | Size | Type | Field | Description |
|---:|---:|---|---|---|
| 0 | 5 | bytes\[5\] | magic | `4D 41 48 49 4D` ("MAHIM") |
| 5 | 1 | uint8 | format_major | Format major version (1 for this document) |
| 6 | 1 | uint8 | format_minor | Format minor version (0 for this document) |
| 7 | 1 | uint8 | header_flags | Header flag bits (Section 5.3) |
| 8 | 4 | uint32 | header_length | Total header size in bytes; `56 + application_identifier_length` |
| 12 | 2 | uint16 | application_identifier_length | Length of the application identifier in bytes |
| 14 | 4 | uint32 | application_payload_version | Application-owned payload version |
| 18 | 4 | uint32 | section_count | Number of section descriptors in the directory |
| 22 | 8 | uint64 | section_directory_offset | Absolute file offset of the section directory |
| 30 | 8 | uint64 | section_directory_length | Size of the section directory in bytes |
| 38 | 8 | uint64 | file_length | Total file size in bytes, including the optional file digest |
| 46 | 4 | uint32 | header_checksum | CRC32C of the header with this field zeroed (Section 5.4) |
| 50 | 6 | bytes\[6\] | reserved | MUST be zero in v1 |
| 56 | N | utf8\[N\] | application_identifier | N = application_identifier_length (Section 6) |

### 5.2 Field semantics

- `format_major` MUST be `1` for files conforming to this document. Readers
  MUST reject files with an unknown major version (Section 11).
- `format_minor` MUST be `0` for files conforming to this document.
- `header_length` MUST equal `56 + application_identifier_length`. Any other
  value is malformed. Readers MUST validate this before using offsets.
- `application_payload_version` is entirely application-defined. MAHIM assigns
  it no meaning. It is independent of `format_major`/`format_minor`.
- `section_count` is the exact number of 48-byte descriptors in the directory.
- `section_directory_offset` and `section_directory_length` MUST describe a
  range that lies entirely after the header and before all section payloads
  (`section_directory_offset >= header_length`).
- `file_length` MUST equal the actual number of bytes in the file. A mismatch
  indicates truncation or appended garbage and MUST be rejected.
- The reserved 6 bytes at offset 50 MUST be zero. Writers MUST write zeros;
  readers MUST reject non-zero values (they indicate an unknown incompatible
  extension of the fixed prefix).

### 5.3 Header flags

`header_flags` is a uint8 bit field:

| Bit | Mask | Name | Meaning |
|---:|---:|---|---|
| 0 | 0x01 | FILE_DIGEST_SHA256 | A 32-byte SHA-256 file digest is present as the last 32 bytes of the file |
| 1–7 | 0xFE | reserved | MUST be zero |

A reader that encounters any reserved flag bit set MUST reject the file with an
unsupported-feature error. Flag bits are how future minor versions may signal
optional or required capabilities; unknown set bits are therefore never ignored.

### 5.4 Header checksum

`header_checksum` is CRC32C (Section 9) computed over the entire header
(`header_length` bytes: the fixed 56-byte prefix plus the application
identifier), with the four bytes at offsets `[46, 50)` replaced by zero bytes
during computation.

Purpose: detect accidental corruption of the header before any offset is
trusted. The header checksum is an integrity check only, not an authenticity
mechanism (Section 13).

Verification of the header checksum MUST succeed before a reader uses any
header field (other than the magic and versions needed for detection) to
locate other regions of the file.

---

## 6. Application identifier

Every MAHIM file MUST carry exactly one application identifier naming the
application that owns or consumes the file's application-level content.

### 6.1 Representation

- Encoding: UTF-8.
- Length: 1 to 255 bytes (`application_identifier_length`).
- Character set: lowercase ASCII letters `a`–`z`, digits `0`–`9`, and the
  separators `.`, `-`, `_`.
- The first character MUST be a lowercase ASCII letter `a`–`z`.
- MUST NOT be empty, MUST NOT contain uppercase letters, spaces, slashes, or
  any other characters.
- Comparison is byte-exact (case-sensitive); the charset makes identifiers
  effectively case-insensitive by construction.

Examples of valid identifiers: `svelp`, `example`, `com.example.tool`, `app-v2`.

### 6.2 Stability rules

- An identifier MUST remain stable once used publicly. The same identifier MUST
  always denote the same application.
- Identifiers MUST NOT be reused for a different application.
- Applications MAY evolve their internal payload schema; they signal that with
  `application_payload_version`, never by changing the identifier semantics.
- MAHIM core contains no hardcoded application identifiers. A registry of
  known identifiers is maintained as a documentation artifact
  (`docs/application-identifiers.md`), not as a runtime dependency.

### 6.3 Namespace separation

The application identifier scopes all application-defined concepts in the file:
application section types (Section 8), `application_defined_id` values
(Section 7.3), and application metadata sections. Two different applications
may use the same application-defined type numbers without collision because
their identifiers differ.

---

## 7. Section directory

The section directory enables direct lookup of sections without scanning
payloads. It consists of two parts stored contiguously:

```
+-----------------------------------+  section_directory_offset
| Descriptor 0 (48 bytes)           |
| Descriptor 1 (48 bytes)           |
| ...                               |
| Descriptor (section_count - 1)    |
+-----------------------------------+
| Section name table                |  concatenated UTF-8 names
+-----------------------------------+  section_directory_offset + section_directory_length
```

### 7.1 Directory size

```
name_table_length = sum(name_length[i] for i in [0, section_count))
section_directory_length = 48 * section_count + name_table_length
```

`section_directory_length` in the header MUST equal this value exactly. A
mismatch is malformed.

### 7.2 Section descriptor layout

Each descriptor is exactly 48 bytes:

| Offset | Size | Type | Field | Description |
|---:|---:|---|---|---|
| 0 | 4 | uint32 | section_type | Section type code (Section 8) |
| 4 | 4 | uint32 | section_version | Version of the section's content schema (type-scoped) |
| 8 | 8 | uint64 | payload_offset | Absolute file offset of the section payload |
| 16 | 8 | uint64 | stored_length | Payload size in bytes as stored (post-compression) |
| 24 | 8 | uint64 | uncompressed_length | Payload size after decompression |
| 32 | 4 | uint32 | payload_checksum | CRC32C of the stored payload bytes |
| 36 | 1 | uint8 | encoding | Payload encoding (Section 7.4) |
| 37 | 1 | uint8 | compression | Compression method (Section 7.5) |
| 38 | 2 | uint16 | section_flags | Section flag bits (Section 7.6) |
| 40 | 4 | uint32 | application_defined_id | Application-defined numeric id; 0 means none |
| 44 | 4 | uint32 | name_length | Length of this section's name in bytes; 0 means unnamed |

All descriptor offsets in this table are relative to the start of the
descriptor, not the file.

### 7.3 Field semantics

- `section_version` is scoped to the section type. MAHIM core does not
  interpret it. It allows applications to evolve individual section schemas.
- `payload_offset` MUST satisfy:
  `payload_offset + stored_length <= file_length - digest_size`
  and the payload range MUST NOT intersect the header or the directory.
- `uncompressed_length` MUST equal `stored_length` when `compression == 0`.
  When compression is used, it MUST equal the exact decompressed size.
- `payload_checksum` covers exactly the `stored_length` bytes at
  `payload_offset` (the on-disk, possibly compressed bytes). See Section 9.
- `application_defined_id` is an application-scoped uint32 tag (for example a
  record kind, a language code table index, or a stable key). `0` means "no
  id". MAHIM core never interprets it.
- `name_length` MUST be `<= 255` in v1. Names beyond 255 bytes MUST NOT be
  written. Readers MUST reject longer names as malformed.

### 7.4 Payload encoding

| Value | Name | Meaning |
|---:|---|---|
| 0 | raw | Opaque bytes; no structural interpretation |
| 1 | cbor | Structured data encoded as canonical CBOR (Appendix A) |
| 2 | utf8 | UTF-8 text |
| 3–255 | reserved | Unassigned; readers MUST reject with an unsupported-encoding error |

`encoding` describes the *logical* content type of the uncompressed bytes.
Compression is orthogonal and described separately. For `encoding == 1` and
`encoding == 2`, the decompressed bytes MUST be valid CBOR / UTF-8
respectively; readers that decode them MUST reject malformed content.

### 7.5 Compression method

| Value | Name | Meaning |
|---:|---|---|
| 0 | none | No compression; stored bytes are the payload |
| 1 | deflate_raw | Raw DEFLATE stream (RFC 1951), no zlib or gzip wrapper |
| 2–255 | reserved | Unassigned; readers MUST reject with an unsupported-compression error |

A reader MUST be able to determine the compression method per section from the
descriptor alone. Readers MUST NOT silently ignore or substitute an unknown
compression method. v1 defines exactly two methods (`none`, `deflate_raw`).

`deflate_raw` streams decompress to exactly `uncompressed_length` bytes. If a
stream produces more or fewer bytes, the file is malformed or corrupt.

### 7.6 Section flags

`section_flags` is a uint16 bit field:

| Bit | Mask | Name | Meaning |
|---:|---:|---|---|
| 0 | 0x0001 | OPTIONAL | Unknown section type MAY be skipped safely |
| 1 | 0x0002 | CRITICAL | Unknown section type MUST cause the reader to fail |
| 2–15 | 0xFFFC | reserved | MUST be zero |

Exactly one of OPTIONAL and CRITICAL MUST be set. Both set, or neither set, is
malformed. Reserved bits set MUST be rejected.

Semantics for *known* section types (core types, or application types when the
reader implements that application) are unaffected by these flags: the reader
processes the section normally. The flags govern behavior when the reader does
**not** understand the section type:

- OPTIONAL: skip the section; continue; surface it in listings as unknown.
- CRITICAL: fail with an unsupported-feature error. Continuing would risk
  silently misinterpreting the file.

### 7.7 Section name table

The name table is the concatenation of the sections' UTF-8 names in descriptor
order. For descriptor `i`, its name starts at:

```
name_table_start = section_directory_offset + 48 * section_count
name_offset[i]   = name_table_start + sum(name_length[j] for j in [0, i))
```

A `name_length` of 0 means the section is unnamed; it contributes zero bytes to
the name table. Names SHOULD be short ASCII identifiers (for example
`manifest`, `payload`, `thumbnail`); MAHIM core does not interpret them.
Names MUST be valid UTF-8. Name uniqueness within a file is RECOMMENDED but
not required; lookups by name use the first match in directory order.

---

## 8. Section types

Section types are uint32 codes. The code space is split:

| Range | Owner | Meaning |
|---|---|---|
| 0x00000000 | MAHIM core | Invalid; MUST NOT appear in a valid file |
| 0x00000001 | MAHIM core | `metadata` — core structured metadata (Section 8.1) |
| 0x00000002 | MAHIM core | `application_payload` — opaque application payload |
| 0x00000003 | MAHIM core | `asset` — opaque binary asset (image, document, blob) |
| 0x00000004 | MAHIM core | `index` — opaque structured index, typically CBOR |
| 0x00000005 | MAHIM core | `extension` — generic extension record (Section 8.2) |
| 0x00000006–0x0000FFFF | MAHIM core | Reserved for future core types |
| 0x00010000–0xFFFFFFFF | Application | Application-defined, scoped by the application identifier |

Core types are generic and application-neutral. MAHIM core MUST NOT define
application-domain types (for example questionnaire, survey, or scanner
sections); such types belong in the application namespace starting at
`0x00010000`.

### 8.1 Core metadata

A file MAY contain at most one section of type `metadata` (0x00000001). If more
than one is present, the file is malformed. When present, its `encoding` MUST
be `cbor` (1), and its content is a CBOR map (Appendix A profile) with
text-string keys.

Core metadata is minimal by design. v1 defines no mandatory keys. Keys
beginning with `mahim.` are reserved for future core use; applications MUST NOT
write keys with that prefix into a core metadata section. All other keys are
available to the application for lightweight hints (display name, creation
time, etc.), but applications SHOULD put substantial structured data in their
own sections and SHOULD NOT depend on core metadata keys for correctness.

An empty map `{}` is valid core metadata.

### 8.2 Extension sections

Section type `extension` (0x00000005) is the generic carrier for extension
features. An extension section's *name* identifies the extension feature (for
example `sha256-manifest`). This lets generic readers report a precise
unsupported-feature error ("extension `sha256-manifest`") and lets
documentation registries describe extension names.

A reader that recognizes the extension name processes the section according to
that extension's documentation. A reader that does not recognize the name
applies the OPTIONAL/CRITICAL rule from Section 7.6.

---

## 9. Integrity and checksums

MAHIM v1 separates two concerns:

1. **Accidental corruption detection** — mandatory, cheap (CRC32C).
2. **Strong integrity verification** — optional (SHA-256 file digest).

MAHIM v1 does NOT provide authenticity, signatures, or encryption
(Section 13).

### 9.1 CRC32C

All CRC checks in v1 use CRC-32C (Castagnoli):

| Parameter | Value |
|---|---|
| Polynomial | 0x1EDC6F41 (reflected form 0x82F63B78) |
| Initial value | 0xFFFFFFFF |
| Final XOR | 0xFFFFFFFF |
| Reflection | input and output reflected |
| Bit order | LSB-first per byte |

Known-answer test: CRC32C of the ASCII bytes `123456789` is `0xE3069283`,
serialized as the 4 bytes `83 92 06 E3` in little-endian.

CRC32C is stored as uint32 little-endian. It detects accidental corruption; it
is not a cryptographic authenticator.

### 9.2 Section payload checksum

`payload_checksum` is CRC32C over exactly the `stored_length` bytes at
`payload_offset` (the bytes as stored in the file, after compression). Readers
MUST verify this checksum before handing stored bytes to a decompressor or to
the application. Verification failure MUST be reported as a checksum mismatch
error, never silently ignored.

An empty payload (`stored_length == 0`) has CRC32C `0x00000000`.

### 9.3 Optional file digest (SHA-256)

If header flag `FILE_DIGEST_SHA256` (bit 0) is set:

- The file's last 32 bytes are `SHA-256(file[0 .. file_length - 32))`.
- `file_length` includes those 32 bytes.
- Readers performing full verification MUST recompute and compare the digest.
- Writers MUST compute the digest over all preceding bytes, including the
  header, directory, and every payload.

This is intended for distribution and archival integrity, at the cost of
reading the whole file. Everyday reads do not need it; per-section CRC32C is
sufficient for corruption detection during normal parsing.

---

## 10. Compression

### 10.1 Rules

- Compression is per section. A file MUST NOT be compressed as a whole.
- `compression == 0` (`none`): `stored_length == uncompressed_length`, and the
  stored bytes are the payload.
- `compression == 1` (`deflate_raw`): the stored bytes are one raw DEFLATE
  stream (RFC 1951) that inflates to exactly `uncompressed_length` bytes.
- Writers MUST NOT set a compression method other than `none` or
  `deflate_raw` in v1.
- Readers MUST reject unknown methods with an unsupported-compression error
  and MUST NOT fall back to treating them as `none`.

### 10.2 Decompression safety

Decompressed size is attacker-influenced if the file is untrusted. Readers
MUST:

1. Enforce `uncompressed_length` against a maximum decompressed size limit
   (Section 12) *before* allocating output buffers where possible, and while
   streaming decompression in any case.
2. Abort decompression if actual output exceeds `uncompressed_length`.
3. Abort decompression if actual output exceeds the configured limit.
4. Abort if the stream terminates early relative to `uncompressed_length`.
5. Treat a compressed section whose decompressed size is small relative to its
   stored size claims with the same hard limits; ratio heuristics MAY be
   applied as an additional configurable defense but MUST NOT replace the hard
   size cap.

---

## 11. Versioning and compatibility

### 11.1 Two independent versions

- **Format version** (`format_major.format_minor`): version of the container
  mechanics defined by this specification.
- **Application payload version** (`application_payload_version`): version of
  the application's content schema.

These MUST remain independent. A MAHIM format v2 MUST NOT imply that every
embedded application's schema changed. Conversely, an application MUST NOT
signal schema changes by anything other than `application_payload_version`
(plus per-section `section_version` where useful).

### 11.2 Major version

`format_major` changes only for incompatible structural changes (field sizes,
layout, semantics). Readers MUST reject files whose `format_major` they do not
support. v1 readers MUST reject `format_major != 1`.

### 11.3 Minor version

`format_minor` increments for backward-compatible, additive changes:
new reserved field assignments, new optional section types, new flag-bit
assignments that remain zero in older files.

Reader rules:

1. `format_minor == 0`: fully known to a v1 reader; parse normally.
2. `format_minor > 0` (newer minor version): parse normally IFF no reserved
   flag bit (header or section) is set and no unknown CRITICAL section is
   present. Reserved bits set, or unknown CRITICAL sections, MUST cause an
   unsupported-feature error regardless of minor version.
3. Writer rules: writers SHOULD write `format_minor = 0` unless they use a
   feature that this specification assigns to a higher minor version.

### 11.4 Feature signals

Reserved flag bits and CRITICAL sections are the *feature signals* of the
format. The compatibility contract is:

| Situation | Reader behavior |
|---|---|
| Unknown major version | Reject (unsupported version) |
| Known major, newer minor, no unknown feature signals | Accept |
| Unknown reserved flag bit set | Reject (unsupported feature) |
| Unknown section type marked OPTIONAL | Skip safely |
| Unknown section type marked CRITICAL | Reject (unsupported feature) |
| Unknown encoding or compression value | Reject (unsupported encoding/compression) |

Forward compatibility guidance for writers: do not require readers to
understand a section unless it is marked CRITICAL; prefer OPTIONAL for
additive data.

---

## 12. Parser safety requirements

A MAHIM parser MUST treat every file as untrusted input. At minimum, a parser
MUST validate all of the following and fail with a precise structured error
(rejecting the file, never partially trusting it):

1. Magic bytes exactly match.
2. `format_major` is supported; `format_minor` compatibility rules (Section 11.3).
3. Reserved header bytes (offset 50..55) are zero.
4. Reserved header flag bits are zero.
5. `header_length == 56 + application_identifier_length` and
   `header_length` is within the header-size limit and within the file.
6. The header checksum matches before header-derived offsets are trusted.
7. The application identifier matches the grammar in Section 6.1 and the
   configured length limit.
8. `file_length` equals the actual input size (detects truncation and
   over-claiming).
9. `section_directory_offset >= header_length`.
10. `section_directory_length == 48 * section_count + name_table_length`
    (computed after reading descriptors and names).
11. The directory range `[section_directory_offset, +section_directory_length)`
    lies within the file and does not overlap the header.
12. `section_count` is within the configured limit (default 65536).
13. Every descriptor's arithmetic is overflow-safe: `payload_offset +
    stored_length` MUST NOT overflow and MUST lie within the payload region.
14. Payload ranges MUST NOT overlap the header, the directory, each other, or
    the optional file digest. Zero-length payloads occupy no bytes.
15. `uncompressed_length == stored_length` when `compression == none`.
16. `uncompressed_length` and `stored_length` are within configured limits.
17. Exactly one of OPTIONAL/CRITICAL per section; reserved section flag bits zero.
18. Name table contents: total length matches; every name is valid UTF-8 and
    within the name-length limit.
19. Section type 0 MUST NOT appear. More than one `metadata` section MUST be
    rejected.
20. Encodings and compression methods are from the assigned sets (else
    unsupported-encoding / unsupported-compression).
21. When a payload is read: CRC32C verifies; decompression output matches
    `uncompressed_length` and respects decompression limits.
22. If the file digest flag is set and full verification is requested, the
    SHA-256 digest verifies.

Recommended default limits (callers MAY override):

| Limit | Default |
|---|---|
| max header length | 4 096 bytes |
| max application identifier length | 255 bytes |
| max section count | 65 536 |
| max section name length | 255 bytes |
| max section directory length | 32 MiB (33 554 432 bytes) |
| max section stored length | 1 GiB (1 073 741 824 bytes) |
| max section uncompressed length | 1 GiB (1 073 741 824 bytes) |
| max decompression ratio (optional heuristic, 0 = disabled) | 0 |

Parsers MUST NOT allocate output buffers based solely on untrusted length
claims without the corresponding limit checks.

---

## 13. Security model

MAHIM v1 provides:

- **Structural validation**: a well-formed file has unambiguous, bounds-checked
  structure.
- **Accidental corruption detection**: CRC32C per section and per header, plus
  truncation detection via `file_length`.
- **Safe bounds handling**: every offset/length is validated; decompression is
  limit-bounded.
- **Optional strong integrity**: SHA-256 file digest for archival checks.

MAHIM v1 does NOT provide:

- **Confidentiality**: no encryption. Anyone with the file can read it.
- **Authenticity**: no signatures. CRC32C and SHA-256 detect accidents and
  storage errors; an attacker who can modify the file can recompute them.
- **Malware protection**: MAHIM does not scan or interpret application payload
  semantics. A MAHIM file can carry arbitrary bytes.
- **Trust in application content**: applications MUST validate their own
  payload schemas. A structurally valid MAHIM file may contain semantically
  invalid, hostile, or nonsensical application data.

Encryption and signatures are intentionally out of scope for v1. Reserved flag
bits and CRITICAL extension sections are the designated mechanism for adding
them in future versions or companion specifications without breaking v1
readers.

---

## 14. Deterministic writing

This section defines what "deterministic" means for MAHIM and the rules
writers must follow to achieve it.

### 14.1 Guarantee

Given identical:

- section list, order, and contents,
- section metadata (types, versions, encodings, compression choices, flags, ids, names),
- application identifier and application payload version,
- writer options (e.g. presence of the file digest),
- compression implementation,

a writer following these rules produces byte-identical output.

The format itself injects no randomness, no timestamps, no counters, and no
process-unique values. If an application stores timestamps, they are ordinary
content and naturally affect output.

### 14.2 Writer rules for determinism

1. Write `format_major = 1`, `format_minor = 0`.
2. Write all reserved fields as zero.
3. Place the directory immediately after the header
   (`section_directory_offset = header_length`).
4. Place payloads immediately after the directory, in directory order,
   with no gaps and no padding:
   `payload_offset[0] = header_length + section_directory_length`, and each
   subsequent payload starts exactly where the previous ends.
5. Preserve insertion order of sections exactly; do not sort or reorder.
6. Encode `cbor` sections with the canonical profile (Appendix A).
7. Compute all checksums with the methods in Section 9.

### 14.3 Compression caveat

DEFLATE output bytes depend on the compression implementation and its
version/settings. Byte-identical output is guaranteed only when the same
deflate implementation is used. For maximum cross-implementation determinism,
use `compression = none`. This is a property of DEFLATE encoders, not of MAHIM;
all conformant decoders produce identical *decompressed* bytes.

### 14.4 Canonical section ordering

Directory order is significant and preserved. MAHIM core does not require
semantic ordering, but applications SHOULD adopt this recommended order for
predictability:

1. core metadata
2. application metadata / manifest
3. application payload
4. assets
5. extensions

Semantics MUST NOT depend on physical placement (offsets); only directory
order is meaningful.

---

## 15. Media type and file naming

- Canonical file extension: `.mahim` (lowercase).
- Proposed media type: `application/x-mahim` (provisional; no IANA
  registration is claimed by this document).

The extension is a convention. The magic bytes are authoritative.

MAHIM core imposes no filename scheme. Applications MAY use descriptive names
(for example `Food-Frequency-Study-v3.mahim`); such schemes are application
policy, not format semantics. General recommendation: prefer portable
filenames (portable character set, no case-only distinctions, no leading
dashes).

---

## 16. Application identifier registry

Known identifiers are recorded in `docs/application-identifiers.md`. The
registry is informational and versioned with the repository; there is no
central registration service.

Rules for new identifiers:

1. lowercase; charset `[a-z0-9._-]`; first character `[a-z]`;
2. length 1–255 bytes (short is better);
3. stable once published;
4. never reused for a different application;
5. record it in the registry with owner and description.

The following identifiers are registered at publication of this
specification:

| Identifier | Owner | Description |
|---|---|---|
| `svelp` | Svelp project | Reserved for the Svelp application |
| `mahim` | MAHIM project | Reserved for MAHIM tooling and examples |

---

## 17. Error model

Conformant implementations SHOULD expose structured errors rather than generic
failures. This specification defines the following logical error conditions;
the reference implementation's names are listed in `docs/errors.md`:

| Condition | Cause |
|---|---|
| invalid magic | bytes `[0,5)` are not `MAHIM` |
| unsupported format version | `format_major` unknown |
| malformed header | field constraints violated |
| invalid application identifier | grammar violated |
| header checksum mismatch | header CRC32C failed |
| file length mismatch | `file_length` != actual size |
| truncated file | input shorter than `file_length` |
| invalid section directory | directory size/count/name table invalid |
| section bounds error | payload range out of file/region |
| section overlap | payload ranges overlap |
| checksum mismatch | section CRC32C failed |
| file digest mismatch | SHA-256 file digest failed |
| unsupported encoding | unknown encoding value |
| unsupported compression | unknown compression value |
| unsupported feature | unknown critical section or reserved flag bit |
| resource limit | parser limit exceeded (incl. decompression caps) |
| malformed section | decompression failed or produced wrong size |

---

## Appendix A — Canonical CBOR profile

Structured metadata (section encoding `cbor`) uses a strict subset and
canonical form of CBOR (RFC 8949), called **MAHIM Canonical CBOR**.

### A.1 Allowed data items

| Item | CBOR major type | Notes |
|---|---|---|
| Unsigned integer | 0 | `0 .. 2^64-1` |
| Negative integer | 1 | `-2^64 .. -1` |
| Byte string | 2 | definite length only |
| Text string | 3 | definite length only; valid UTF-8 |
| Array | 4 | definite length only |
| Map | 5 | definite length only; keys MUST be text strings |
| Simple: false, true, null | 7 (20, 21, 22) | only these simple values |

Forbidden in MAHIM Canonical CBOR: indefinite-length items, tags (major type 6),
floating-point numbers, simple values other than 20/21/22, and map keys that
are not text strings.

### A.2 Canonical encoding rules

1. Every length and integer MUST use the shortest possible encoding.
2. Every string, byte string, array, and map MUST use definite length.
3. Map keys MUST be unique and MUST be sorted in bytewise lexicographic order
   of their encoded key bytes (RFC 8949 §4.2.1). Since keys are text strings,
   this compares the encoded key *bytes* (including the major-type/length
   prefix), not decoded code-point order.
4. Decoders used for validation MUST reject non-canonical encodings
   (long-form lengths, unsorted or duplicate map keys, forbidden items).

### A.3 Example

The metadata map `{"app": "demo", "count": 3}` encodes as:

```
A2                  # map(2)
   63 61 70 70      # "app"
   64 64 65 6D 6F   # "demo"
   65 63 6F 75 6E 74 # "count"
   03               # 3
```

(`count` < `app` in encoded-key order because `65 ...` < `63 ...`? No: `app`
encodes as `63 61 70 70` and `count` as `65 63 6F 75 6E 74`; `0x63 < 0x65`, so
`app` is written first.)

---

## Appendix B — Complete binary layout example

A file with one unnamed application payload section, no compression, no file
digest:

| Offset | Bytes | Field | Value |
|---:|---|---|---|
| 0 | `4D 41 48 49 4D` | magic | "MAHIM" |
| 5 | `01` | format_major | 1 |
| 6 | `00` | format_minor | 0 |
| 7 | `00` | header_flags | none |
| 8 | `41 00 00 00` | header_length | 65 |
| 12 | `05 00` | application_identifier_length | 5 |
| 14 | `01 00 00 00` | application_payload_version | 1 |
| 18 | `01 00 00 00` | section_count | 1 |
| 22 | `41 00 00 00 00 00 00 00` | section_directory_offset | 65 |
| 30 | `30 00 00 00 00 00 00 00` | section_directory_length | 48 |
| 38 | `71 00 00 00 00 00 00 00` | file_length | 113 |
| 46 | *(crc32c)* | header_checksum | CRC32C |
| 50 | `00 00 00 00 00 00` | reserved | 0 |
| 56 | `73 76 65 6C 70` | application_identifier | "svelp" |
| 65 | descriptor | section 0 | type=application_payload, … |
| 113 | — | end | file_length = 113 |

With one 0-byte payload: directory occupies `[65, 113)`, payload occupies
`[113, 113)`, `file_length = 113`.

Canonical fixture files in `fixtures/` were generated from these rules and are
verified byte-for-byte by the test suite.

---

## Appendix C — Conformance checklist for independent implementations

A conformant reader:

- [ ] detects MAHIM by magic bytes alone
- [ ] rejects unknown `format_major`
- [ ] validates `header_length` against `application_identifier_length`
- [ ] verifies the header checksum before trusting header offsets
- [ ] validates the application identifier grammar
- [ ] checks `file_length` against actual input size
- [ ] parses 48-byte descriptors and the name table; verifies directory length
- [ ] bounds-checks every payload range; detects overlap
- [ ] verifies CRC32C of stored payload bytes on read
- [ ] rejects unknown encoding/compression values
- [ ] enforces decompression limits and exact decompressed sizes
- [ ] skips unknown OPTIONAL sections; fails on unknown CRITICAL sections
- [ ] rejects reserved flag bits set and reserved header bytes non-zero
- [ ] optionally verifies the SHA-256 file digest

A conformant writer:

- [ ] writes little-endian fields exactly as specified
- [ ] writes zero reserved fields
- [ ] computes the header checksum with the checksum field zeroed
- [ ] computes per-section CRC32C over stored bytes
- [ ] writes canonical CBOR for `cbor` sections
- [ ] emits non-overlapping, in-order payloads with no injected randomness
