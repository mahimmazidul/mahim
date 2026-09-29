import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeCbor, encodeCbor, type CborValue } from "../src/encoding/cbor.js"
import { CborDecodeError } from "../src/errors/index.js"

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ")
}

test("rfc 8949 appendix a vectors", () => {
  assert.equal(hex(encodeCbor(0)), "00")
  assert.equal(hex(encodeCbor(1)), "01")
  assert.equal(hex(encodeCbor(10)), "0a")
  assert.equal(hex(encodeCbor(23)), "17")
  assert.equal(hex(encodeCbor(24)), "18 18")
  assert.equal(hex(encodeCbor(25)), "18 19")
  assert.equal(hex(encodeCbor(100)), "18 64")
  assert.equal(hex(encodeCbor(1000)), "19 03 e8")
  assert.equal(hex(encodeCbor(1000000)), "1a 00 0f 42 40")
  assert.equal(hex(encodeCbor(-1)), "20")
  assert.equal(hex(encodeCbor(-10)), "29")
  assert.equal(hex(encodeCbor(-100)), "38 63")
  assert.equal(hex(encodeCbor(-1000)), "39 03 e7")
  assert.equal(hex(encodeCbor(false)), "f4")
  assert.equal(hex(encodeCbor(true)), "f5")
  assert.equal(hex(encodeCbor(null)), "f6")
  assert.equal(hex(encodeCbor("")), "60")
  assert.equal(hex(encodeCbor("a")), "61 61")
  assert.equal(hex(encodeCbor("IETF")), "64 49 45 54 46")
  assert.equal(hex(encodeCbor(new Uint8Array([0]))), "41 00")
  assert.equal(hex(encodeCbor([])), "80")
  assert.equal(hex(encodeCbor([1, 2, 3])), "83 01 02 03")
})

test("map keys are sorted by encoded key bytes", () => {
  const encoded = encodeCbor({ b: 1, a: 2, aa: 3, "": 4 })
  assert.equal(hex(encoded), "a4 60 04 61 61 02 61 62 01 62 61 61 03")
  assert.deepEqual(decodeCbor(encoded), { "": 4, b: 1, a: 2, aa: 3 })
})

test("round trip of nested structures", () => {
  const value: CborValue = {
    app: "demo",
    count: 3,
    nested: { z: [1, 2, { deep: true }], a: null },
    blob: new Uint8Array([1, 2, 3, 255]),
    list: ["x", "", -5],
  }
  const encoded = encodeCbor(value)
  const decoded = decodeCbor(encoded) as Record<string, CborValue>
  assert.equal(decoded.app, "demo")
  assert.equal(decoded.count, 3)
  assert.deepEqual([...(decoded.blob as Uint8Array)], [1, 2, 3, 255])
  assert.deepEqual(decodeCbor(encodeCbor(value)), decoded)
  assert.equal(hex(encodeCbor(decoded)), hex(encoded))
})

test("decoder rejects non-canonical and forbidden items", () => {
  assert.throws(() => decodeCbor(new Uint8Array([0x18, 0x17])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0x61, 0x61, 0x00])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0x5f, 0x41, 0x00, 0xff])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0xd8, 0x18, 0x01])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0xf9, 0x3c, 0x00])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0xf7])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0xa2, 0x61, 0x62, 0x01, 0x61, 0x61, 0x02])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0xa1, 0x01, 0x02])), CborDecodeError)
  assert.throws(() => decodeCbor(new Uint8Array([0x01, 0x00])), CborDecodeError)
})

test("encoder rejects floats and unsafe integers", () => {
  assert.throws(() => encodeCbor(1.5), CborDecodeError)
  assert.throws(() => encodeCbor(NaN), CborDecodeError)
  assert.throws(() => encodeCbor(2 ** 60), CborDecodeError)
})

test("large integers and long strings", () => {
  const big = 2 ** 53 - 1
  assert.deepEqual(decodeCbor(encodeCbor(big)), big)
  assert.deepEqual(decodeCbor(encodeCbor(-big)), -big)
  const longText = "x".repeat(1000)
  assert.deepEqual(decodeCbor(encodeCbor(longText)), longText)
  const longBytes = new Uint8Array(70000).fill(7)
  assert.deepEqual(decodeCbor(encodeCbor(longBytes)), longBytes)
})
