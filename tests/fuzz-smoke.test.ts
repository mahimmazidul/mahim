import { test } from "node:test"
import assert from "node:assert/strict"
import { openMahim, parseMahimHeader } from "../src/reader/reader.js"
import { createMahimWriter } from "../src/writer/writer.js"
import { MahimError } from "../src/errors/index.js"
import { CompressionMethod, SectionType } from "../src/format/constants.js"
import { encodeCbor } from "../src/encoding/cbor.js"

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

const baseFile = await createMahimWriter({ fileDigest: true })
  .setApplication({ identifier: "fuzz", payloadVersion: 1 })
  .addSection({ type: SectionType.Metadata, name: "meta", data: encodeCbor({ a: 1, b: "two" }) })
  .addSection({
    type: SectionType.ApplicationPayload,
    name: "payload",
    compression: CompressionMethod.DeflateRaw,
    data: text("fuzzable payload ".repeat(40)),
  })
  .addSection({ type: SectionType.Asset, name: "asset", data: new Uint8Array([1, 2, 3, 4, 5]) })
  .finalize()

test("mutated inputs never crash the parser with non-MAHIM errors", async () => {
  const random = makeRandom(0x5eed1234)
  for (let iteration = 0; iteration < 400; iteration += 1) {
    const mutated = baseFile.slice()
    const mutations = 1 + Math.floor(random() * 6)
    for (let m = 0; m < mutations; m += 1) {
      const mode = random()
      if (mode < 0.7) {
        const index = Math.floor(random() * mutated.length)
        mutated[index] = mutated[index]! ^ (1 << Math.floor(random() * 8))
      } else if (mode < 0.85) {
        const index = Math.floor(random() * mutated.length)
        mutated[index] = Math.floor(random() * 256)
      } else {
        const index = Math.floor(random() * mutated.length)
        mutated[index] = 0
      }
    }
    await assertNoForeignThrow(mutated, iteration)
  }
})

test("random truncations never crash the parser with non-MAHIM errors", async () => {
  const random = makeRandom(0xc0ffee)
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const length = Math.floor(random() * baseFile.length)
    await assertNoForeignThrow(baseFile.slice(0, length), iteration)
  }
})

test("random byte floods never crash the parser with non-MAHIM errors", async () => {
  const random = makeRandom(0xdeadbeef)
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const length = 8 + Math.floor(random() * 256)
    const flooded = new Uint8Array(length)
    for (let i = 0; i < length; i += 1) {
      flooded[i] = Math.floor(random() * 256)
    }
    await assertNoForeignThrow(flooded, iteration)
  }
})

async function assertNoForeignThrow(bytes: Uint8Array, iteration: number): Promise<void> {
  try {
    const reader = await openMahim(bytes, { rejectUnknownCritical: false })
    const sections = reader.listSections()
    for (const descriptor of sections) {
      try {
        await reader.getStoredSection(descriptor.index)
        if (descriptor.storedLength < 4096 && descriptor.uncompressedLength < 65536) {
          await reader.getSection(descriptor.index)
        }
      } catch (error) {
        assert.ok(
          error instanceof MahimError,
          `iteration ${iteration} section read raised ${String(error)}`,
        )
      }
    }
    try {
      await reader.verify({ decompress: false })
    } catch (error) {
      assert.ok(
        error instanceof MahimError,
        `iteration ${iteration} verify raised ${String(error)}`,
      )
    }
    try {
      await parseMahimHeader(bytes)
    } catch (error) {
      assert.ok(
        error instanceof MahimError,
        `iteration ${iteration} header parse raised ${String(error)}`,
      )
    }
  } catch (error) {
    assert.ok(
      error instanceof MahimError,
      `iteration ${iteration} open raised ${String(error)}`,
    )
  }
}
