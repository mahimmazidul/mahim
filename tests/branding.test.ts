import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))

const brandSvgs: Record<string, string> = {
  "assets/brand/mahim-symbol.svg": "0 0 24 24",
  "assets/brand/mahim-wordmark.svg": "0 0 80 24",
  "assets/brand/mahim-horizontal.svg": "0 0 104 32",
  "assets/brand/mahim-vertical.svg": "0 0 60 52",
  "assets/brand/mahim-monochrome.svg": "0 0 104 32",
  "assets/brand/mahim-inverted.svg": "0 0 104 32",
  "assets/file-icons/mahim-file.svg": "0 0 48 48",
}

const bannedSvgParts = [
  "<script",
  "<image",
  "<animate",
  "<style",
  "<text",
  "<font",
  "<filter",
  "<mask",
  "<pattern",
  "<metadata",
  "<!--",
  "href",
  "xlink",
  "url(",
  "data:",
  "base64",
  ".png",
  ".jpg",
  "stroke",
  "javascript",
  "inkscape",
  "sodipodi",
  "rdf",
]

const symbolPath =
  "M2 2h20v20H2V2Zm2 2v16h16V4H4ZM6 5h8v2.5H6ZM6 9.5h11v2.5H6ZM6 14h7v5H6Z"

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf8")
}

function pngSize(path: string): [number, number] {
  const bytes = readFileSync(path)
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR")
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

test("brand svgs are minimal fill-only vector sources", () => {
  for (const [relative, viewBox] of Object.entries(brandSvgs)) {
    assert.ok(existsSync(join(root, relative)), `missing ${relative}`)
    const svg = read(relative)
    assert.ok(svg.startsWith("<svg"), `${relative} must start with <svg`)
    assert.ok(svg.trimEnd().endsWith("</svg>"), `${relative} must end with </svg>`)
    assert.match(svg, new RegExp(`viewBox="${viewBox}"`), `${relative} viewBox`)
    const body = svg.replace('xmlns="http://www.w3.org/2000/svg"', "")
    for (const part of bannedSvgParts) {
      assert.ok(!body.toLowerCase().includes(part), `${relative} contains ${part}`)
    }
    assert.ok(!body.includes("http"), `${relative} contains external reference`)
    assert.ok(Buffer.byteLength(svg) <= 4096, `${relative} too large`)
    assert.match(svg, /<path[^>]*fill="/, `${relative} must use fill paths`)
  }
})

test("canonical symbol path is stable", () => {
  assert.ok(read("assets/brand/mahim-symbol.svg").includes(`d="${symbolPath}"`))
  assert.ok(read("assets/file-icons/mahim-file.svg").includes(`d="${symbolPath}"`))
})

test("lockup color assignments", () => {
  assert.ok(read("assets/brand/mahim-symbol.svg").includes('fill="#000000"'))
  assert.ok(read("assets/brand/mahim-horizontal.svg").includes('fill="#4B5158"'))
  assert.ok(read("assets/brand/mahim-monochrome.svg").includes('fill="#000000"'))
  assert.ok(!read("assets/brand/mahim-monochrome.svg").includes("#4B5158"))
  assert.ok(read("assets/brand/mahim-inverted.svg").includes('fill="#FFFFFF"'))
  assert.ok(!read("assets/brand/mahim-inverted.svg").includes("#000000"))
})

test("raster derivatives cover the required sizes", () => {
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    const path = join(root, "assets", "file-icons", "png", String(size), "mahim-file.png")
    assert.ok(existsSync(path), `missing ${size}px raster`)
    assert.deepEqual(pngSize(path), [size, size])
  }
})

test("windows ico contains standard icon sizes", () => {
  const ico = readFileSync(join(root, "assets", "file-icons", "mahim-file.ico"))
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  const count = ico.readUInt16LE(4)
  assert.equal(count, 6)
  const sizes = new Set<number>()
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16
    const raw = ico[entry]
    sizes.add(raw === 0 ? 256 : (raw as number))
  }
  for (const size of [16, 32, 48, 64, 128, 256]) {
    assert.ok(sizes.has(size), `ico missing ${size}px frame`)
  }
})

test("docs and readme use the provisional media type wording", () => {
  for (const relative of ["README.md", "docs/branding.md", "docs/file-associations.md"]) {
    const normalized = read(relative).replace(/\*/g, "")
    assert.ok(normalized.includes("application/x-mahim"), `${relative} missing media type`)
    assert.ok(/provisional/i.test(normalized), `${relative} must say provisional`)
    for (const line of normalized.split("\n")) {
      if (/IANA/i.test(line)) {
        assert.match(line, /(not|no |never|provisional|does not)/i, `${relative} claims IANA registration`)
      }
    }
    assert.ok(!/TypeScript file format/i.test(normalized), `${relative} must not define MAHIM as a TypeScript file format`)
  }
  const readme = read("README.md").replace(/\s+/g, " ")
  assert.ok(readme.includes("versioned binary container format for portable application data"))
})

test("readme and docs asset references resolve", () => {
  const docs = ["README.md", "docs/branding.md", "docs/file-associations.md"]
  for (const relative of docs) {
    const content = read(relative)
    const refs = new Set<string>()
    for (const match of content.matchAll(/\]\((?:\.\.\/)?(assets\/[^)#]+)\)/g)) refs.add(match[1]!)
    for (const match of content.matchAll(/(?:src|srcset)="(?:\.\.\/)?(assets\/[^"]+)"/g)) refs.add(match[1]!)
    for (const ref of refs) {
      assert.ok(existsSync(join(root, ref)), `${relative} references missing ${ref}`)
    }
    assert.ok(refs.size > 0, `${relative} should reference assets`)
  }
})
