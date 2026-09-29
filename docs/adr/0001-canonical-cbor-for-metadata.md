# ADR 0001: Canonical CBOR for structured metadata

Status: accepted

## Context

MAHIM needs a compact, standardized binary encoding for structured metadata
sections. The candidates were CBOR (RFC 8949), MessagePack, and a custom
encoding.

## Decision

Use a strict deterministic subset of CBOR, the **MAHIM Canonical CBOR**
profile (spec Appendix A): definite lengths only, shortest-form integers and
lengths, text-string map keys sorted by encoded key bytes, no tags, no floats,
no indefinite items.

## Rationale

| Criterion | CBOR | MessagePack | Custom |
|---|---|---|---|
| Standardization | RFC 8949 | De-facto spec | none |
| Canonical/deterministic form | defined in the RFC (core deterministic profile) | no formal canonical form | would have to be invented |
| Cross-language implementations | extensive | extensive | none |
| Browser support | encoders widely available; tiny to implement | similar | n/a |
| Size | comparable | comparable | — |
| Self-description | typed model incl. byte strings | typed model | — |

CBOR's formal deterministic encoding profile is the deciding factor: MAHIM
requires byte-identical output for identical inputs, and canonical map-key
ordering removes the last source of nondeterminism (object key iteration
order). MessagePack has no standardized canonical form. A custom encoding
would violate the project goal of portability and easy reimplementation.

The outer MAHIM container remains fully custom; only the metadata item
encoding is CBOR.

## Consequences

- Implementations need a small CBOR codec (a few hundred lines) or any
  RFC 8949 library restricted to the profile.
- Floats, tags, and indefinite-length items are rejected in v1 metadata;
  applications needing them can carry their own sections.
- Non-canonical CBOR is rejected by validators, so canonical output is
  enforced end to end.
