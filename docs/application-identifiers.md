# Application identifiers

Every MAHIM file names its owning/consumer application with a short, stable
identifier stored in the header. The identifier scopes all application-defined
content in the file: application section types (>= `0x00010000`),
`application_defined_id` values, and application metadata conventions.

MAHIM core contains no hardcoded application identifiers. The registry below
is a documentation artifact, not a runtime dependency or a centralized
service.

## Rules

1. **Charset**: lowercase ASCII letters `a`–`z`, digits `0`–`9`, and the
   separators `.`, `-`, `_`.
2. **First character**: a lowercase letter `a`–`z`.
3. **Length**: 1–255 UTF-8 bytes (short is better; aim under 32).
4. **Case**: effectively case-insensitive by construction — uppercase is
   forbidden, comparisons are byte-exact.
5. **Stability**: once used publicly, an identifier MUST always denote the
   same application and MUST NOT be reused for a different one.
6. **Versioning**: application schema changes are signaled with
   `application_payload_version` (and per-section `section_version`), never by
   changing the identifier.

Valid examples: `svelp`, `example`, `com.example.tool`, `app-v2`, `study_2026`.

Invalid examples: `Svelp` (uppercase), `1app` (digit first), `my app` (space),
`my/app` (slash), `` (empty), `a…` (non-ASCII).

## Namespace separation

Two applications may use the same application-defined type numbers without
collision because their identifiers differ. Application-defined types are
always interpreted relative to the file's identifier; a reader for application
A must not interpret type `0x00010005` in a file owned by application B.

## Registry

| Identifier | Owner | Description | Registered |
|---|---|---|---|
| `mahim` | MAHIM project | MAHIM tooling, examples, and fixtures | v1.0 |
| `svelp` | Svelp project | Reserved for the Svelp application | v1.0 |
| `com.example.tool` | MAHIM examples | Documentation/example identifier | v1.0 |

## Adding an identifier

Open a pull request adding a row to the registry with:

- the identifier,
- the owning project (name + contact or repository),
- a one-line description,
- confirmation that the identifier is not already in use.

Review is social, not technical: the goal is preventing accidental collisions
and documenting who owns what. Identifiers are never reassigned.
