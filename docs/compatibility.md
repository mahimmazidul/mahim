# Compatibility and versioning

## Two independent versions

A MAHIM file carries two version numbers with strictly separate meanings:

| Version | Field | Meaning |
|---|---|---|
| Format version | `format_major`.`format_minor` | Mechanics of the container itself |
| Application payload version | `application_payload_version` | The application's content schema |

A MAHIM format v2 MUST NOT imply that every embedded application's schema
changed. Applications evolve their schema by bumping
`application_payload_version` (and per-section `section_version`), never by
abusing format versions.

## Major versions

`format_major` changes only for incompatible structural changes: field sizes,
layout, or semantics. Readers MUST reject unknown major versions
(`UnsupportedFormatVersionError`). v1 readers reject `format_major != 1`.

## Minor versions

`format_minor` increments for backward-compatible, additive changes: new
optional section types, new assignments for previously reserved values that
older files never use, new flag-bit meanings that remain zero in older files.

Reader behavior:

| Situation | Behavior |
|---|---|
| `format_minor == 0` | Fully known; parse normally |
| `format_minor > 0`, no unknown feature signals | Parse normally |
| `format_minor > 0`, unknown reserved flag bit set | Reject (`UnsupportedFeatureError`) |
| Any minor, unknown CRITICAL section present | Reject (`UnsupportedFeatureError`) |
| Any minor, unknown OPTIONAL section present | Skip safely |
| Any minor, unknown encoding/compression value | Reject |

## Feature signals

Reserved flag bits (header and section) and CRITICAL sections are the format's
feature signals. The contract is simple: if a file uses a capability a reader
does not implement, the file marks it and the reader fails loudly; additive
data that readers may ignore is marked OPTIONAL and skipped.

## Writer guidance

- Write `format_minor = 0` unless you use a feature this specification
  assigns to a higher minor version.
- Prefer OPTIONAL sections for new data; use CRITICAL only when
  misinterpretation would be worse than rejection.
- Do not invent meanings for reserved values; propose assignments in the
  specification instead.

## Evolution policy

Once published, field sizes and meanings are frozen for a major version.
Canonical fixtures are the compatibility contract: if a change would alter how
existing fixtures parse, it requires a major version bump. Additive evolution
(minor versions) is the preferred path for all growth, including future
signatures and encryption extensions.
