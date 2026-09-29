# MAHIM

<img src="assets/brand/mahim-symbol.svg" alt="MAHIM symbol" width="72">

**MAHIM** is a versioned binary container format for portable application
data. It is section-oriented, extensible, integrity-aware, and
application-independent — self-describing, fast and safe to parse, and
unambiguous to reimplement in any language.

This repository contains:

- the [MAHIM v1 specification](spec/mahim-v1.md) — the authoritative format definition
- a reference implementation written in TypeScript (zero runtime dependencies)
- a reader/writer library with validation and corruption detection
- a small CLI for inspection and extraction
- [Python examples](examples/python/) implementing the format from the spec (stdlib only)
- canonical fixtures, corruption fixtures, and a full test suite
- [documentation](docs/) and [examples](examples/)

MAHIM is an independent format project. It is not tied to any application;
applications (such as Svelp) are consumers of MAHIM, never part of it.

## Highlights

- **Self-describing files** — magic bytes, format version, application
  identifier, application payload version, and a full section directory are
  all inside the file. Identification never depends on file extensions.
- **Typed sections** — generic core types (metadata, application payload,
  asset, index, extension) plus an application-scoped type namespace.
- **Random access** — a compact 48-byte-per-section directory enables direct
  lookup, lazy loading, and selective reads without scanning payloads.
- **Per-section compression** — optional `deflate_raw`; sections stay
  independently addressable.
- **Corruption detection** — CRC32C on the header and on every section
  payload, truncation detection via declared file length, optional SHA-256
  file digest for archival verification.
- **Safe by default** — every offset, length, count, and decompression is
  bounds-checked with configurable resource limits; unknown critical sections
  and unknown flag bits fail loudly.
- **Deterministic output** — identical inputs produce identical bytes
  (see [docs/determinism.md](docs/determinism.md)).
- **Canonical CBOR metadata** — a strict deterministic CBOR profile for
  structured metadata, no custom data language.
- **Portable** — explicit little-endian integers, explicit widths, UTF-8
  strings; easy to reimplement from the spec alone.

## Quick start

```sh
npm install
npm run build
```

### Write a file

```ts
import { createMahimWriter, encodeCbor, SectionType, CompressionMethod } from "mahim"

const bytes = await createMahimWriter({ fileDigest: true })
  .setApplication({ identifier: "example", payloadVersion: 1 })
  .addSection({
    type: SectionType.Metadata,
    name: "meta",
    data: encodeCbor({ title: "Demo" }),
  })
  .addSection({
    type: SectionType.ApplicationPayload,
    name: "payload",
    data: new TextEncoder().encode("hello"),
  })
  .addSection({
    type: SectionType.Asset,
    name: "image",
    compression: CompressionMethod.DeflateRaw,
    data: imageBytes,
  })
  .finalize()
```

### Read a file

```ts
import { openMahim, parseMahimHeader } from "mahim"

const header = await parseMahimHeader(bytes)          // header only
const reader = await openMahim(bytes)                 // header + directory

console.log(reader.applicationIdentifier)             // "example"
console.log(reader.listSections())                    // descriptors

const payload = await reader.getSection("payload")    // decompressed, verified
const report = await reader.verify()                  // full integrity check
```

`openMahim` accepts `Uint8Array`, `ArrayBuffer`, and `Blob`/`File` — in
browsers, large files can be inspected and read section-by-section through
Blob slicing without loading the whole file into memory first.

### CLI

```sh
node bin/mahim.mjs info <file>
node bin/mahim.mjs list <file>
node bin/mahim.mjs verify <file>
node bin/mahim.mjs extract-section <file> <name-or-index> [--output <path>]
node bin/mahim.mjs create-demo <output>
```

Example output:

```
Format: MAHIM 1.0
Application: svelp
Application payload version: 1
Sections: 5
File size: 1234 bytes
File digest: none
Integrity: valid
```

## Format overview

```
+--------------------------------------+ offset 0
| Header (56 bytes + application id)   |
+--------------------------------------+
| Section directory                    |
|   descriptors (48 bytes each)        |
|   name table (UTF-8)                 |
+--------------------------------------+
| Section payload 0                    |
| Section payload 1                    |
| ...                                  |
+--------------------------------------+
| Optional SHA-256 file digest (32 B)  |
+--------------------------------------+ file_length
```

- Magic bytes: `4D 41 48 49 4D` (`MAHIM`)
- Byte order: little-endian for all fixed-width integers
- Format version 1.0, kept strictly separate from application payload versions
- Structured metadata: canonical CBOR (RFC 8949 subset)
- Compression: `none`, `deflate_raw` (RFC 1951) per section
- Checksums: CRC32C (Castagnoli) per section and header; optional SHA-256
  whole-file digest

Full details: [spec/mahim-v1.md](spec/mahim-v1.md) and
[docs/binary-layout.md](docs/binary-layout.md).

## Testing and tooling

```sh
npm test           # typecheck-compiled unit, round-trip, corruption, fuzz, CLI tests
npm run typecheck  # strict TypeScript checks
npm run lint       # comment-free source policy + marker scan
npm run fixtures   # regenerate canonical fixtures (deterministic)
npm run bench      # performance benchmarks (writes docs/benchmarks.md)
npm run size       # bundle size report
npm run validate   # typecheck + lint + full test suite
```

Canonical fixtures live in [`fixtures/`](fixtures/) with expected metadata in
`fixtures/expected/`. Byte-exact golden fixtures are verified against fresh
deterministic builds on every test run.

## Browser and runtime support

The core library uses only standard APIs available in modern browsers and
Node.js 18+: `Uint8Array`, `TextEncoder`/`TextDecoder`, `Blob`,
`CompressionStream`/`DecompressionStream`, `crypto.subtle` (unused by default).
Node-specific file helpers live in a separate `mahim/node` entry point; the
CLI is a Node-only tool. See [docs/compatibility.md](docs/compatibility.md).

## Documentation

| Document | Contents |
|---|---|
| [spec/mahim-v1.md](spec/mahim-v1.md) | Authoritative format specification |
| [docs/binary-layout.md](docs/binary-layout.md) | Visual binary layout and worked example |
| [docs/determinism.md](docs/determinism.md) | Deterministic writing rules |
| [docs/security-model.md](docs/security-model.md) | What MAHIM does and does not guarantee |
| [docs/errors.md](docs/errors.md) | Structured error catalog |
| [docs/application-identifiers.md](docs/application-identifiers.md) | Application identifier rules and registry |
| [docs/compatibility.md](docs/compatibility.md) | Versioning and compatibility rules |
| [docs/benchmarks.md](docs/benchmarks.md) | Measured performance |
| [docs/branding.md](docs/branding.md) | Symbol, wordmark, lockups, file icon |
| [docs/file-associations.md](docs/file-associations.md) | Platform registration and icon guidance |
| [docs/adr/](docs/adr/) | Architecture decision records |

## Brand and file icon

The official symbol, wordmark, lockups, and `.mahim` file icon live in
[assets/](assets/) as canonical SVG sources with generated PNG and ICO
derivatives. The identity is a container with internal sections — see
[docs/branding.md](docs/branding.md) for usage rules and
[docs/file-associations.md](docs/file-associations.md) for platform
registration. The `.mahim` file icon appears in file managers only after a
MAHIM-aware application registers the extension or MIME type
(`application/x-mahim`, provisional; not IANA-registered).

## Package size

The library is dependency-free. Approximate ESM output size (`npm run size`):

- core library (excluding CLI and Node helpers): ~62 KiB raw, ~17 KiB gzip
- full dist (including CLI): ~72 KiB raw, ~19 KiB gzip

## Security model (summary)

MAHIM v1 provides structural validation, corruption detection, safe bounds
handling, and optional strong integrity (SHA-256). It does **not** provide
confidentiality, authenticity/signatures, or malware protection. Applications
must validate their own payload schemas. See
[docs/security-model.md](docs/security-model.md).

## License

MIT — see [LICENSE](LICENSE).
