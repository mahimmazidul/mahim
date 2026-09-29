import { test } from "node:test"
import assert from "node:assert/strict"
import {
  bytesEqual,
  checkedAdd,
  concatBytes,
  decodeUtf8,
  encodeUtf8,
  readUint16LE,
  readUint32LE,
  readUint64LE,
  readUint8,
  writeUint16LE,
  writeUint32LE,
  writeUint64LE,
  writeUint8,
} from "../src/format/primitives.js"
import { MalformedUtf8Error, ResourceLimitError } from "../src/errors/index.js"

test("little-endian integer round trips", () => {
  const buffer = new Uint8Array(16)
  writeUint8(buffer, 0, 0xab)
  writeUint16LE(buffer, 1, 0xbeef)
  writeUint32LE(buffer, 3, 0xdeadbeef)
  writeUint64LE(buffer, 7, 0x100000001)
  assert.equal(readUint8(buffer, 0), 0xab)
  assert.equal(readUint16LE(buffer, 1), 0xbeef)
  assert.equal(readUint32LE(buffer, 3), 0xdeadbeef)
  assert.equal(readUint64LE(buffer, 7), 0x100000001)
  assert.deepEqual([...buffer.slice(1, 3)], [0xef, 0xbe])
  assert.deepEqual([...buffer.slice(3, 7)], [0xef, 0xbe, 0xad, 0xde])
})

test("uint64 rejects unsafe values", () => {
  const buffer = new Uint8Array(8)
  assert.throws(() => writeUint64LE(buffer, 0, -1), ResourceLimitError)
  assert.throws(() => writeUint64LE(buffer, 0, Number.MAX_SAFE_INTEGER + 1), ResourceLimitError)
  buffer.set([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
  assert.throws(() => readUint64LE(buffer, 0), ResourceLimitError)
})

test("reads past buffer end are rejected", () => {
  const buffer = new Uint8Array(3)
  assert.throws(() => readUint32LE(buffer, 0))
  assert.throws(() => readUint16LE(buffer, 2))
  assert.throws(() => readUint16LE(buffer, -1))
})

test("utf8 round trip and strict decode", () => {
  const value = "héllo wörld ✓ বাংলা"
  const bytes = encodeUtf8(value)
  assert.equal(decodeUtf8(bytes), value)
  assert.throws(() => decodeUtf8(new Uint8Array([0xff, 0xfe])), MalformedUtf8Error)
  assert.throws(() => decodeUtf8(new Uint8Array([0xc0, 0x80])), MalformedUtf8Error)
})

test("concat and compare helpers", () => {
  const joined = concatBytes([
    new Uint8Array([1, 2]),
    new Uint8Array([]),
    new Uint8Array([3]),
  ])
  assert.deepEqual([...joined], [1, 2, 3])
  assert.ok(bytesEqual(joined, new Uint8Array([1, 2, 3])))
  assert.ok(!bytesEqual(joined, new Uint8Array([1, 2, 4])))
  assert.ok(!bytesEqual(joined, new Uint8Array([1, 2])))
})

test("checkedAdd detects overflow", () => {
  assert.equal(checkedAdd(2, 3), 5)
  assert.throws(() => checkedAdd(Number.MAX_SAFE_INTEGER, 1), ResourceLimitError)
  assert.throws(() => checkedAdd(-1, 3), ResourceLimitError)
})
