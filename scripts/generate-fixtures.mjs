import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildFixtures } from "../build/tests/helpers/fixture-content.js"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const fixturesDir = join(root, "fixtures")
const expectedDir = join(fixturesDir, "expected")

mkdirSync(fixturesDir, { recursive: true })
mkdirSync(expectedDir, { recursive: true })

const fixtures = await buildFixtures()

for (const [name, result] of fixtures) {
  writeFileSync(join(fixturesDir, name), result.bytes)
  if (result.expected !== null && result.expected !== undefined) {
    const expectedPath = join(expectedDir, `${name.replace(/\.mahim$/, "")}.json`)
    writeFileSync(expectedPath, `${JSON.stringify(result.expected, null, 2)}\n`)
  }
}

console.log(`wrote ${fixtures.size} fixtures`)
