import { test } from "node:test"
import assert from "node:assert/strict"
import { crc32c } from "../src/checksum/crc32c.js"
import { sha256 } from "../src/checksum/sha256.js"
import { encodeUtf8 } from "../src/format/primitives.js"

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

test("crc32c known answers", () => {
  assert.equal(crc32c(new Uint8Array(0)), 0x00000000)
  assert.equal(crc32c(encodeUtf8("123456789")), 0xe3069283)
  assert.equal(crc32c(encodeUtf8("hello")), 0x9a71bb4c)
})

test("crc32c detects single bit flips", () => {
  const base = encodeUtf8("the quick brown fox jumps over the lazy dog")
  const baseCrc = crc32c(base)
  for (const index of [0, 5, 20, base.length - 1]) {
    const mutated = base.slice()
    mutated[index] = mutated[index]! ^ 0x01
    assert.notEqual(crc32c(mutated), baseCrc)
  }
})

test("sha256 known answers", () => {
  assert.equal(toHex(sha256(new Uint8Array(0))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  assert.equal(toHex(sha256(encodeUtf8("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  assert.equal(
    toHex(sha256(encodeUtf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  )
})

test("sha256 handles multi-block and empty boundary lengths", () => {
  const sizes = [55, 56, 57, 63, 64, 65, 119, 120, 1000]
  for (const size of sizes) {
    const digest = sha256(new Uint8Array(size))
    assert.equal(digest.length, 32)
  }
  const large = new Uint8Array(10000).fill(0x5a)
  assert.equal(toHex(sha256(large)), toHex(sha256(large.slice())))
})
