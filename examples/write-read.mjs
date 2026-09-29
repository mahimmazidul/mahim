import { writeFileSync } from "node:fs"
import {
  CompressionMethod,
  SectionType,
  createMahimWriter,
  decodeCbor,
  encodeCbor,
  openMahim,
  parseMahimHeader,
} from "../dist/index.js"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const imageLike = new Uint8Array(2048)
for (let i = 0; i < imageLike.length; i += 1) {
  imageLike[i] = (i * 7) & 0xff
}

const fileBytes = await createMahimWriter({ fileDigest: true })
  .setApplication({ identifier: "com.example.tool", payloadVersion: 1 })
  .addSection({
    type: SectionType.Metadata,
    name: "meta",
    data: encodeCbor({ title: "Write/read example", createdAt: "2026-09-30" }),
  })
  .addSection({
    type: SectionType.ApplicationPayload,
    name: "payload",
    data: encoder.encode("hello from MAHIM"),
  })
  .addSection({
    type: SectionType.Asset,
    name: "image",
    compression: CompressionMethod.DeflateRaw,
    data: imageLike,
  })
  .finalize()

writeFileSync(new URL("./write-read.mahim", import.meta.url), fileBytes)

const header = await parseMahimHeader(fileBytes)
console.log(`format: MAHIM ${header.formatVersion.major}.${header.formatVersion.minor}`)
console.log(`application: ${header.applicationIdentifier} v${header.applicationPayloadVersion}`)

const reader = await openMahim(fileBytes)
for (const section of reader.listSections()) {
  console.log(`section ${section.index}: ${section.name} (type ${section.type}, ${section.storedLength} stored bytes)`)
}

const metadata = decodeCbor(await reader.getSection("meta"))
console.log("metadata:", metadata)
console.log("payload:", decoder.decode(await reader.getSection("payload")))

const restoredImage = await reader.getSection("image")
console.log("image restored:", restoredImage.length === imageLike.length)

const report = await reader.verify()
console.log(`integrity: ${report.valid ? "valid" : "invalid"}`)

const roundTripOk = Buffer.from(restoredImage).equals(Buffer.from(imageLike))
console.log(`round trip: ${roundTripOk ? "identical" : "FAILED"}`)
