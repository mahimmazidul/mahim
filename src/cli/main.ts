import { readFile, writeFile } from "node:fs/promises"
import { openMahim, type MahimReader, type VerificationReport } from "../reader/reader.js"
import { createMahimWriter } from "../writer/writer.js"
import { encodeCbor } from "../encoding/cbor.js"
import { CompressionMethod, SectionType } from "../format/constants.js"
import { MahimError, SectionNotFoundError } from "../errors/index.js"

const encoder = new TextEncoder()

export async function runMain(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    printUsage()
    return command === undefined ? 2 : 0
  }
  try {
    switch (command) {
      case "info":
        return await commandInfo(rest)
      case "list":
        return await commandList(rest)
      case "verify":
        return await commandVerify(rest)
      case "extract-section":
        return await commandExtractSection(rest)
      case "create-demo":
        return await commandCreateDemo(rest)
      default:
        process.stderr.write(`error: unknown command ${JSON.stringify(command)}\n`)
        printUsage()
        return 2
    }
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`error: ${error.message}\n`)
      return 2
    }
    if (error instanceof MahimError) {
      process.stderr.write(`error: ${error.name}: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

class UsageError extends Error {}

function printUsage(): void {
  process.stdout.write(
    [
      "mahim — binary container tool",
      "",
      "usage:",
      "  mahim info <file>",
      "  mahim list <file>",
      "  mahim verify <file>",
      "  mahim extract-section <file> <name-or-index> [--output <path>]",
      "  mahim create-demo <output>",
      "",
    ].join("\n"),
  )
}

function requireFile(args: readonly string[]): string {
  const file = args[0]
  if (file === undefined) {
    throw new UsageError("missing file argument")
  }
  return file
}

async function loadReader(file: string, rejectUnknownCritical = true): Promise<MahimReader> {
  const bytes = new Uint8Array(await readFile(file))
  return openMahim(bytes, { rejectUnknownCritical })
}

async function commandInfo(args: readonly string[]): Promise<number> {
  const file = requireFile(args)
  const reader = await loadReader(file, false)
  const report = await reader.verify({ decompress: false })
  const version = reader.header.formatVersion
  process.stdout.write(
    [
      `Format: MAHIM ${version.major}.${version.minor}`,
      `Application: ${reader.header.applicationIdentifier}`,
      `Application payload version: ${reader.header.applicationPayloadVersion}`,
      `Sections: ${reader.header.sectionCount}`,
      `File size: ${reader.header.fileLength} bytes`,
      `File digest: ${reader.header.fileDigestSha256 ? "sha256" : "none"}`,
      `Integrity: ${report.valid ? "valid" : "invalid"}`,
      "",
    ].join("\n"),
  )
  return report.valid ? 0 : 1
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

function typeName(type: number): string {
  switch (type) {
    case SectionType.Metadata:
      return "metadata"
    case SectionType.ApplicationPayload:
      return "application_payload"
    case SectionType.Asset:
      return "asset"
    case SectionType.Index:
      return "index"
    case SectionType.Extension:
      return "extension"
    default:
      return type >= 0x00010000 ? `app:0x${type.toString(16)}` : `core:0x${type.toString(16)}`
  }
}

function encodingName(encoding: number): string {
  switch (encoding) {
    case 0:
      return "raw"
    case 1:
      return "cbor"
    case 2:
      return "utf8"
    default:
      return String(encoding)
  }
}

function compressionName(compression: number): string {
  switch (compression) {
    case 0:
      return "none"
    case 1:
      return "deflate_raw"
    default:
      return String(compression)
  }
}

async function commandList(args: readonly string[]): Promise<number> {
  const file = requireFile(args)
  const reader = await loadReader(file, false)
  const header = [
    pad("INDEX", 6),
    pad("NAME", 28),
    pad("TYPE", 20),
    pad("ENCODING", 10),
    pad("COMPRESSION", 13),
    pad("OFFSET", 10),
    pad("STORED", 10),
    pad("SIZE", 10),
    pad("FLAGS", 10),
    pad("APP-ID", 8),
  ].join("")
  const lines = [header]
  for (const section of reader.listSections()) {
    lines.push(
      [
        pad(String(section.index), 6),
        pad(section.name === "" ? "-" : section.name, 28),
        pad(typeName(section.type), 20),
        pad(encodingName(section.encoding), 10),
        pad(compressionName(section.compression), 13),
        pad(String(section.payloadOffset), 10),
        pad(String(section.storedLength), 10),
        pad(String(section.uncompressedLength), 10),
        pad(section.critical ? "critical" : "optional", 10),
        pad(section.applicationDefinedId === 0 ? "-" : String(section.applicationDefinedId), 8),
      ].join(""),
    )
  }
  process.stdout.write(`${lines.join("\n")}\n`)
  return 0
}

async function commandVerify(args: readonly string[]): Promise<number> {
  const file = requireFile(args)
  const reader = await loadReader(file, true)
  const report = await reader.verify()
  printVerification(report)
  return report.valid ? 0 : 1
}

function printVerification(report: VerificationReport): void {
  process.stdout.write(`Header checksum: ${report.headerChecksumValid ? "valid" : "invalid"}\n`)
  if (report.fileDigestPresent) {
    process.stdout.write(`File digest (sha256): ${report.fileDigestValid ? "valid" : "invalid"}\n`)
  } else {
    process.stdout.write("File digest (sha256): not present\n")
  }
  for (const section of report.sections) {
    const label = section.name === "" ? `index ${section.index}` : `${section.index} (${section.name})`
    const sizeNote =
      section.decompressedSizeValid === null
        ? ""
        : section.decompressedSizeValid
          ? ", size valid"
          : ", size invalid"
    process.stdout.write(
      `Section ${label}: ${section.checksumValid ? "checksum valid" : "checksum invalid"}${sizeNote}\n`,
    )
  }
  process.stdout.write(`Integrity: ${report.valid ? "valid" : "invalid"}\n`)
}

async function commandExtractSection(args: readonly string[]): Promise<number> {
  const file = requireFile(args)
  const selector = args[1]
  if (selector === undefined) {
    throw new UsageError("missing section selector")
  }
  let outputPath: string | null = null
  for (let i = 2; i < args.length; i += 1) {
    if (args[i] === "--output" || args[i] === "-o") {
      outputPath = args[i + 1] ?? null
      if (outputPath === null) {
        throw new UsageError("missing value for --output")
      }
      i += 1
    } else {
      throw new UsageError(`unknown option ${JSON.stringify(args[i])}`)
    }
  }
  const reader = await loadReader(file, true)
  const query = /^\d+$/.test(selector) ? Number(selector) : selector
  try {
    const bytes = await reader.getSection(query)
    if (outputPath === null) {
      process.stdout.write(Buffer.from(bytes))
    } else {
      await writeFile(outputPath, bytes)
      process.stdout.write(`wrote ${bytes.length} bytes to ${outputPath}\n`)
    }
    return 0
  } catch (error) {
    if (error instanceof SectionNotFoundError) {
      process.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

async function commandCreateDemo(args: readonly string[]): Promise<number> {
  const output = requireFile(args)
  const bytes = await createMahimWriter({ fileDigest: true })
    .setApplication({ identifier: "mahim", payloadVersion: 1 })
    .addSection({
      type: SectionType.Metadata,
      name: "meta",
      data: encodeCbor({ generator: "mahim-cli", kind: "demo" }),
    })
    .addSection({
      type: SectionType.ApplicationPayload,
      name: "payload",
      data: encoder.encode("demo application payload"),
    })
    .addSection({
      type: SectionType.Asset,
      name: "asset",
      compression: CompressionMethod.DeflateRaw,
      data: encoder.encode("demo asset ".repeat(64)),
    })
    .finalize()
  await writeFile(output, bytes)
  process.stdout.write(`wrote ${bytes.length} bytes to ${output}\n`)
  return 0
}
