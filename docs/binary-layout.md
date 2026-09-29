# MAHIM v1 binary layout

This document is a visual companion to the
[formal specification](../spec/mahim-v1.md). The specification is
authoritative.

## File regions

```
offset 0
+--------------------------------------------------+
| HEADER                                           |
|   magic "MAHIM" (5) | major (1) | minor (1)      |
|   flags (1) | header_length (4)                  |
|   app id length (2) | payload version (4)        |
|   section_count (4)                              |
|   directory offset (8) | directory length (8)    |
|   file_length (8) | header checksum (4)          |
|   reserved (6)                                   |
|   application identifier (UTF-8, 1..255 bytes)   |
+--------------------------------------------------+
| SECTION DIRECTORY                                |
|   descriptor 0 (48 bytes)                        |
|   descriptor 1 (48 bytes)                        |
|   ...                                            |
|   name table (concatenated UTF-8 names)          |
+--------------------------------------------------+
| SECTION PAYLOAD 0  (stored bytes, maybe deflated)|
| SECTION PAYLOAD 1                                |
| ...                                              |
+--------------------------------------------------+
| FILE DIGEST (32 bytes, optional, SHA-256)        |
+--------------------------------------------------+
file_length
```

## Header field table (fixed 56-byte prefix)

| Offset | Size | Type | Field |
|---:|---:|---|---|
| 0 | 5 | bytes | magic = `4D 41 48 49 4D` |
| 5 | 1 | uint8 | format_major = 1 |
| 6 | 1 | uint8 | format_minor = 0 |
| 7 | 1 | uint8 | header_flags |
| 8 | 4 | uint32 | header_length = 56 + app id length |
| 12 | 2 | uint16 | application_identifier_length |
| 14 | 4 | uint32 | application_payload_version |
| 18 | 4 | uint32 | section_count |
| 22 | 8 | uint64 | section_directory_offset |
| 30 | 8 | uint64 | section_directory_length |
| 38 | 8 | uint64 | file_length |
| 46 | 4 | uint32 | header_checksum (CRC32C) |
| 50 | 6 | bytes | reserved = zero |
| 56 | N | utf8 | application_identifier |

Header flags: bit 0 = FILE_DIGEST_SHA256; bits 1–7 reserved (must be zero).

## Section descriptor table (48 bytes each)

| Offset | Size | Type | Field |
|---:|---:|---|---|
| 0 | 4 | uint32 | section_type |
| 4 | 4 | uint32 | section_version |
| 8 | 8 | uint64 | payload_offset |
| 16 | 8 | uint64 | stored_length |
| 24 | 8 | uint64 | uncompressed_length |
| 32 | 4 | uint32 | payload_checksum (CRC32C of stored bytes) |
| 36 | 1 | uint8 | encoding (0 raw, 1 cbor, 2 utf8) |
| 37 | 1 | uint8 | compression (0 none, 1 deflate_raw) |
| 38 | 2 | uint16 | section_flags (bit0 optional, bit1 critical) |
| 40 | 4 | uint32 | application_defined_id |
| 44 | 4 | uint32 | name_length (0 = unnamed) |

Section types: 1 metadata, 2 application_payload, 3 asset, 4 index,
5 extension; 0x00010000+ application-defined.

## Worked example

`single-section.mahim`: application `svelp`, payload version 3, one unnamed-by-
type application payload section named `payload` containing `hello mahim`
(11 bytes), no compression, no file digest.

| Offset | Value | Meaning |
|---:|---|---|
| 0 | `4D 41 48 49 4D` | magic "MAHIM" |
| 5 | `01` | format major 1 |
| 6 | `00` | format minor 0 |
| 7 | `00` | no flags |
| 8 | `3D 00 00 00` | header_length = 61 |
| 12 | `05 00` | app id length = 5 |
| 14 | `03 00 00 00` | payload version = 3 |
| 18 | `01 00 00 00` | section_count = 1 |
| 22 | `3D 00 ...` | directory offset = 61 |
| 30 | `37 00 ...` | directory length = 55 (48 + 7 name bytes) |
| 38 | `7F 00 ...` | file_length = 127 |
| 46 | *(crc32c)* | header checksum |
| 50 | 6 zero bytes | reserved |
| 56 | `73 76 65 6C 70` | "svelp" |
| 61 | descriptor | type=2, version=3, offset=116, stored=11, uncompressed=11, crc32c(...), enc=0, comp=0, flags=optional, app-id=1, name_length=7 |
| 109 | `payload` | name table |
| 116 | `hello mahim` | section payload |
| 127 | end | |

The committed fixture `fixtures/single-section.mahim` matches these rules
byte-for-byte and is verified by the test suite.

## Layout invariants

1. `header_length = 56 + application_identifier_length`.
2. `section_directory_length = 48 * section_count + name_table_length`.
3. Every payload range lies inside the payload region
   `[section_directory_offset + section_directory_length, file_length - digest_size)`.
4. Non-empty payload ranges never overlap.
5. `file_length` equals the physical file size exactly.
6. All integers are little-endian; all reserved fields are zero.
