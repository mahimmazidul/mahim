import { test } from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readMahimFile, parseMahimFileHeader, writeMahimFile } from "../src/node/index.js"
import { createMahimWriter } from "../src/writer/writer.js"
import { SectionType } from "../src/format/constants.js"

const run = promisify(execFile)
const cliPath = new URL("../../bin/mahim.mjs", import.meta.url).pathname
const fixturesDir = new URL("../../fixtures/", import.meta.url).pathname

async function cli(args: readonly string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [cliPath, ...args])
    return { stdout, stderr, code: 0 }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      code: failure.code ?? 1,
    }
  }
}

test("cli info reports format summary", async () => {
  const result = await cli(["info", join(fixturesDir, "single-section.mahim")])
  assert.equal(result.code, 0)
  assert.match(result.stdout, /Format: MAHIM 1\.0/)
  assert.match(result.stdout, /Application: svelp/)
  assert.match(result.stdout, /Application payload version: 3/)
  assert.match(result.stdout, /Sections: 1/)
  assert.match(result.stdout, /Integrity: valid/)
  assert.ok(!/\p{Extended_Pictographic}/u.test(result.stdout))
})

test("cli list prints section table", async () => {
  const result = await cli(["list", join(fixturesDir, "multi-section.mahim")])
  assert.equal(result.code, 0)
  assert.match(result.stdout, /INDEX/)
  assert.match(result.stdout, /meta/)
  assert.match(result.stdout, /application_payload/)
  assert.match(result.stdout, /deflate_raw|none/)
  assert.match(result.stdout, /demo-extension/)
})

test("cli verify passes valid files and fails corrupt ones", async () => {
  const good = await cli(["verify", join(fixturesDir, "with-file-digest.mahim")])
  assert.equal(good.code, 0)
  assert.match(good.stdout, /Integrity: valid/)
  assert.match(good.stdout, /File digest \(sha256\): valid/)

  const bad = await cli(["verify", join(fixturesDir, "corrupt-checksum.mahim")])
  assert.equal(bad.code, 1)
  assert.match(bad.stdout, /Integrity: invalid/)
  assert.match(bad.stdout, /checksum invalid/)
})

test("cli rejects invalid files with structured errors", async () => {
  const magic = await cli(["info", join(fixturesDir, "invalid-magic.mahim")])
  assert.equal(magic.code, 1)
  assert.match(magic.stderr, /InvalidMagicError/)

  const version = await cli(["info", join(fixturesDir, "unsupported-version.mahim")])
  assert.equal(version.code, 1)
  assert.match(version.stderr, /UnsupportedFormatVersionError/)

  const critical = await cli(["verify", join(fixturesDir, "unknown-critical-section.mahim")])
  assert.equal(critical.code, 1)
  assert.match(critical.stderr, /UnsupportedFeatureError/)
})

test("cli extract-section writes decompressed bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mahim-cli-"))
  try {
    const output = join(dir, "out.bin")
    const result = await cli([
      "extract-section",
      join(fixturesDir, "compressed-section.mahim"),
      "compressed",
      "--output",
      output,
    ])
    assert.equal(result.code, 0)
    const written = await readFile(output)
    assert.equal(written.toString("utf8"), "compressible payload ".repeat(64))

    const missing = await cli([
      "extract-section",
      join(fixturesDir, "compressed-section.mahim"),
      "nope",
      "--output",
      output,
    ])
    assert.equal(missing.code, 1)
    assert.match(missing.stderr, /not found/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("cli create-demo produces an inspectable file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mahim-cli-"))
  try {
    const output = join(dir, "demo.mahim")
    const created = await cli(["create-demo", output])
    assert.equal(created.code, 0)
    const info = await cli(["info", output])
    assert.equal(info.code, 0)
    assert.match(info.stdout, /Application: mahim/)
    assert.match(info.stdout, /Sections: 3/)
    const list = await cli(["list", output])
    assert.match(list.stdout, /asset/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("cli usage errors exit with code 2", async () => {
  const none = await cli([])
  assert.equal(none.code, 2)
  const unknown = await cli(["frobnicate"])
  assert.equal(unknown.code, 2)
  const missingFile = await cli(["info"])
  assert.equal(missingFile.code, 2)
})

test("node file helpers read and write mahim files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mahim-node-"))
  try {
    const path = join(dir, "helper.mahim")
    const bytes = await createMahimWriter()
      .setApplication({ identifier: "helper", payloadVersion: 7 })
      .addSection({ type: SectionType.Asset, name: "a", data: new Uint8Array([1, 2, 3]) })
      .finalize()
    await writeMahimFile(path, bytes)
    const header = await parseMahimFileHeader(path)
    assert.equal(header.applicationIdentifier, "helper")
    assert.equal(header.applicationPayloadVersion, 7)
    const reader = await readMahimFile(path)
    assert.equal(reader.listSections().length, 1)
    assert.deepEqual([...(await reader.getSection("a"))], [1, 2, 3])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
