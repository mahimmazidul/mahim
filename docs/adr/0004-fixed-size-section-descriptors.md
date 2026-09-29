# ADR 0004: fixed-size section descriptors with a trailing name table

Status: accepted

## Context

The section directory must support direct lookup, bounds checking, selective
reading, and lazy loading. Variable-length descriptors would complicate every
reader; pure fixed-size descriptors cannot carry names.

## Decision

Each section descriptor is exactly 48 bytes with fixed-width fields. Optional
UTF-8 names live in a name table appended to the descriptor array; a
descriptor's name is located by summing preceding `name_length` values.

```
directory = descriptor[0..count) + name_table
```

## Rationale

- **O(1) lookup**: descriptor `i` is at `directory_offset + 48 * i`.
- **Bounds checking**: all offsets/lengths are fixed-width and validated
  before use.
- **Streaming**: the directory is small and adjacent to the header; payloads
  can be read piecemeal (Blob slicing) without touching the rest.
- **Names without indirection**: the name table keeps descriptors fixed-size
  while still supporting human-readable identifiers. Name offsets are implicit
  (prefix sums), so no extra field is needed.
- **Determinism**: both parts have unambiguous canonical ordering.

Alternatives rejected: TLV descriptors (parsing complexity, harder bounds
checks), separate name section (extra lookup), storing no names at all (worse
ergonomics for tooling and extraction).

## Consequences

- Directory size formula is fixed:
  `48 * section_count + sum(name_length)` and is verified against the header
  field on every parse.
- Names are limited to 255 bytes in v1 (keeps `name_length` semantics simple).
- `application_defined_id` (uint32) covers numeric tagging without strings;
  richer application metadata belongs in sections.
