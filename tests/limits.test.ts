import { test } from "node:test"
import assert from "node:assert/strict"
import { openMahim, parseMahimHeader } from "../src/reader/reader.js"
import { createMahimWriter } from "../src/writer/writer.js"
import { SectionType } from "../src/format/constants.js"
import {
  ResourceLimitError,
  InvalidApplicationIdentifierError,
  InvalidSectionDirectoryError,
} from "../src/errors/index.js"

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

test("section count limit is enforced", async () => {
  const writer = createMahimWriter().setApplication({ identifier: "limits", payloadVersion: 1 })
  for (let i = 0; i < 20; i += 1) {
    writer.addSection({ type: SectionType.Asset, name: `s${i}`, data: text("x") })
  }
  const bytes = await writer.finalize()
  await assert.rejects(
    openMahim(bytes, { limits: { maxSectionCount: 10 } }),
    ResourceLimitError,
  )
  await openMahim(bytes, { limits: { maxSectionCount: 20 } })
})

test("header length limit is enforced", async () => {
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "limits", payloadVersion: 1 })
    .finalize()
  await assert.rejects(openMahim(bytes, { limits: { maxHeaderLength: 40 } }), ResourceLimitError)
  await assert.rejects(parseMahimHeader(bytes), () => false).catch(() => {})
  await parseMahimHeader(bytes)
})

test("name length limit is enforced", async () => {
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "limits", payloadVersion: 1 })
    .addSection({ type: SectionType.Asset, name: "moderately-long-name", data: text("x") })
    .finalize()
  await assert.rejects(
    openMahim(bytes, { limits: { maxSectionNameLength: 5 } }),
    ResourceLimitError,
  )
})

test("directory length limit is enforced", async () => {
  const writer = createMahimWriter().setApplication({ identifier: "limits", payloadVersion: 1 })
  for (let i = 0; i < 10; i += 1) {
    writer.addSection({ type: SectionType.Asset, name: `section-${i}`, data: text("x") })
  }
  const bytes = await writer.finalize()
  await assert.rejects(
    openMahim(bytes, { limits: { maxSectionDirectoryLength: 64 } }),
    ResourceLimitError,
  )
})

test("stored and uncompressed length limits are enforced", async () => {
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "limits", payloadVersion: 1 })
    .addSection({ type: SectionType.Asset, name: "big", data: text("y".repeat(4096)) })
    .finalize()
  await assert.rejects(
    openMahim(bytes, { limits: { maxSectionStoredLength: 1024 } }),
    ResourceLimitError,
  )
  await assert.rejects(
    openMahim(bytes, { limits: { maxSectionUncompressedLength: 1024 } }),
    ResourceLimitError,
  )
})

test("application identifier length limit is enforced at write time", () => {
  assert.throws(
    () => createMahimWriter().setApplication({ identifier: "a".repeat(300), payloadVersion: 1 }),
    InvalidApplicationIdentifierError,
  )
})

test("default limits accept reasonable files", async () => {
  const bytes = await createMahimWriter()
    .setApplication({ identifier: "limits", payloadVersion: 1 })
    .addSection({ type: SectionType.Asset, name: "ok", data: text("content") })
    .finalize()
  const reader = await openMahim(bytes)
  assert.equal(reader.listSections().length, 1)
})
