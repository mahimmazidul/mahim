import { openMahim, parseMahimHeader } from "../dist/index.js"

const path = process.argv[2]
if (path === undefined) {
  console.error("usage: node examples/inspect.mjs <file.mahim>")
  process.exit(2)
}

const { readFile } = await import("node:fs/promises")
const bytes = new Uint8Array(await readFile(path))

const header = await parseMahimHeader(bytes)
console.log("Format:                  ", `MAHIM ${header.formatVersion.major}.${header.formatVersion.minor}`)
console.log("Application:             ", header.applicationIdentifier)
console.log("Application payload ver: ", header.applicationPayloadVersion)
console.log("Sections:                ", header.sectionCount)
console.log("File size:               ", header.fileLength, "bytes")
console.log("File digest:             ", header.fileDigestSha256 ? "sha256" : "none")

const reader = await openMahim(bytes, { rejectUnknownCritical: false })
console.log("")
console.log("Sections:")
for (const section of reader.listSections()) {
  console.log(
    `  [${section.index}] ${section.name || "(unnamed)"} ` +
      `type=${section.type} enc=${section.encoding} comp=${section.compression} ` +
      `stored=${section.storedLength} size=${section.uncompressedLength} ` +
      `${section.critical ? "critical" : "optional"}`,
  )
}

const report = await reader.verify({ decompress: true })
console.log("")
console.log("Integrity:", report.valid ? "valid" : "invalid")
