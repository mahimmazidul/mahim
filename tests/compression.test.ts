import { test } from "node:test"
import assert from "node:assert/strict"
import { compressPayload, decompressPayload } from "../src/compression/index.js"
import {
  CompressionMethod,
} from "../src/format/constants.js"
import {
  MalformedSectionError,
  ResourceLimitError,
  UnsupportedCompressionError,
} from "../src/errors/index.js"

const defaultLimits = { maxUncompressedLength: 1024 * 1024, maxRatio: 0 }

test("deflate round trip", async () => {
  const data = new TextEncoder().encode("hello hello hello hello hello mahim".repeat(50))
  const stored = await compressPayload(data, CompressionMethod.DeflateRaw)
  assert.ok(stored.length < data.length)
  const restored = await decompressPayload(
    stored,
    CompressionMethod.DeflateRaw,
    data.length,
    defaultLimits,
  )
  assert.deepEqual([...restored], [...data])
})

test("none compression is identity", async () => {
  const data = new Uint8Array([1, 2, 3, 4])
  const stored = await compressPayload(data, CompressionMethod.None)
  assert.deepEqual([...stored], [1, 2, 3, 4])
  const restored = await decompressPayload(stored, CompressionMethod.None, 4, defaultLimits)
  assert.deepEqual([...restored], [1, 2, 3, 4])
})

test("empty payloads round trip", async () => {
  const stored = await compressPayload(new Uint8Array(0), CompressionMethod.DeflateRaw)
  const restored = await decompressPayload(
    stored,
    CompressionMethod.DeflateRaw,
    0,
    defaultLimits,
  )
  assert.equal(restored.length, 0)
})

test("unknown compression methods are rejected", async () => {
  await assert.rejects(compressPayload(new Uint8Array([1]), 9), UnsupportedCompressionError)
  await assert.rejects(
    decompressPayload(new Uint8Array([1]), 9, 1, defaultLimits),
    UnsupportedCompressionError,
  )
})

test("decompressed size must match declared length", async () => {
  const data = new Uint8Array(100).fill(3)
  const stored = await compressPayload(data, CompressionMethod.DeflateRaw)
  await assert.rejects(
    decompressPayload(stored, CompressionMethod.DeflateRaw, 99, defaultLimits),
    MalformedSectionError,
  )
  await assert.rejects(
    decompressPayload(stored, CompressionMethod.DeflateRaw, 101, defaultLimits),
    MalformedSectionError,
  )
})

test("decompression limits are enforced", async () => {
  const data = new Uint8Array(4096).fill(0)
  const stored = await compressPayload(data, CompressionMethod.DeflateRaw)
  await assert.rejects(
    decompressPayload(stored, CompressionMethod.DeflateRaw, 4096, {
      maxUncompressedLength: 1024,
      maxRatio: 0,
    }),
    ResourceLimitError,
  )
  await assert.rejects(
    decompressPayload(stored, CompressionMethod.DeflateRaw, 4096, {
      maxUncompressedLength: 8192,
      maxRatio: 2,
    }),
    ResourceLimitError,
  )
})

test("corrupt deflate streams fail as malformed sections", async () => {
  await assert.rejects(
    decompressPayload(new Uint8Array([0xff, 0xff, 0xff]), CompressionMethod.DeflateRaw, 4, defaultLimits),
    MalformedSectionError,
  )
})

test("none compression length mismatch is rejected", async () => {
  await assert.rejects(
    decompressPayload(new Uint8Array([1, 2]), CompressionMethod.None, 3, defaultLimits),
    MalformedSectionError,
  )
})
