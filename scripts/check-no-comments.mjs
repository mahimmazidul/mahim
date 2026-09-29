import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const targets = ["src", "tests", "scripts", "bin", "examples"]
const extensions = new Set([".ts", ".mts", ".js", ".mjs", ".cjs", ".tsx", ".jsx"])

const violations = []

function listFiles(directory) {
  const out = []
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === "build" || entry === "dist") {
        continue
      }
      out.push(...listFiles(full))
    } else if (extensions.has(entry.slice(entry.lastIndexOf(".")))) {
      out.push(full)
    }
  }
  return out
}

function scan(source, filePath, allowShebang) {
  let index = 0
  let line = 1
  let state = "normal"
  const length = source.length
  if (allowShebang && source.startsWith("#!")) {
    index = 2
  }
  while (index < length) {
    const char = source[index]
    const next = source[index + 1]
    if (char === "\n") {
      line += 1
      index += 1
      continue
    }
    if (state === "normal") {
      if (char === "'" || char === '"' || char === "`") {
        state = char
        index += 1
        continue
      }
      if (char === "/" && next === "/") {
        violations.push([filePath, line, "line comment"])
        return
      }
      if (char === "/" && next === "*") {
        violations.push([filePath, line, "block comment"])
        return
      }
      index += 1
      continue
    }
    if (state === "'" || state === '"' || state === "`") {
      if (char === "\\") {
        index += 2
        continue
      }
      if (char === state) {
        state = "normal"
      }
      index += 1
      continue
    }
    index += 1
  }
}

function scanKeywords(source, filePath) {
  const patterns = [/\bTODO\b/, /\bFIXME\b/, /\bXXX\b/, /\bHACK\b/]
  const lines = source.split("\n")
  lines.forEach((text, i) => {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push([filePath, i + 1, `marker ${pattern.source}`])
      }
    }
  })
}

let scanned = 0
for (const target of targets) {
  const directory = join(root, target)
  for (const file of listFiles(directory)) {
    const source = readFileSync(file, "utf8")
    const rel = relative(root, file)
    scan(source, rel, target === "bin")
    scanKeywords(source, rel)
    scanned += 1
  }
}

if (violations.length > 0) {
  for (const [file, line, kind] of violations) {
    process.stderr.write(`${file}:${line}: ${kind}\n`)
  }
  process.stderr.write(`comment-free check failed with ${violations.length} violation(s)\n`)
  process.exit(1)
}

process.stdout.write(`comment-free check passed (${scanned} files)\n`)
