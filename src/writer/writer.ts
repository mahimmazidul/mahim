import {
  InvalidApplicationIdentifierError,
  InvalidSectionDirectoryError,
  MalformedHeaderError,
  MalformedUtf8Error,
  UnsupportedCompressionError,
  UnsupportedEncodingError,
} from "../errors/index.js"
import { crc32c } from "../checksum/crc32c.js"
import { sha256 } from "../checksum/sha256.js"
import { compressPayload } from "../compression/index.js"
import { decodeCbor } from "../encoding/cbor.js"
import {
  CompressionMethod,
  FILE_DIGEST_LENGTH,
  isValidApplicationIdentifier,
  isValidSectionName,
  PayloadEncoding,
  SECTION_FLAG_CRITICAL,
  SECTION_FLAG_OPTIONAL,
  SectionType,
  type ApplicationIdentifier,
} from "../format/constants.js"
import { encodeHeader } from "../format/header.js"
import { encodeSectionDirectory } from "../format/directory.js"
import { concatBytes, encodeUtf8 } from "../format/primitives.js"

export interface ApplicationSpec {
  readonly identifier: ApplicationIdentifier
  readonly payloadVersion: number
}

export interface SectionInput {
  readonly type: number
  readonly data: Uint8Array
  readonly version?: number
  readonly encoding?: number
  readonly compression?: number
  readonly critical?: boolean
  readonly applicationDefinedId?: number
  readonly name?: string
}

export interface MahimWriterOptions {
  readonly fileDigest?: boolean
}

export interface MahimWriter {
  setApplication(spec: ApplicationSpec): MahimWriter
  addSection(input: SectionInput): MahimWriter
  finalize(): Promise<Uint8Array>
}

class MahimWriterImpl implements MahimWriter {
  readonly #fileDigest: boolean
  #application: ApplicationSpec | null = null
  readonly #sections: SectionInput[] = []

  constructor(options?: MahimWriterOptions) {
    this.#fileDigest = options?.fileDigest ?? false
  }

  setApplication(spec: ApplicationSpec): MahimWriter {
    if (this.#application !== null) {
      throw new InvalidApplicationIdentifierError("application is already set on this writer")
    }
    if (!isValidApplicationIdentifier(spec.identifier)) {
      throw new InvalidApplicationIdentifierError(
        `invalid application identifier ${JSON.stringify(spec.identifier)}`,
      )
    }
    if (!Number.isInteger(spec.payloadVersion) || spec.payloadVersion < 0 || spec.payloadVersion > 0xffffffff) {
      throw new MalformedHeaderError(
        `application payload version ${spec.payloadVersion} is not a uint32`,
      )
    }
    this.#application = { identifier: spec.identifier, payloadVersion: spec.payloadVersion }
    return this
  }

  addSection(input: SectionInput): MahimWriter {
    validateSectionInput(input)
    const defaultEncoding =
      input.type === SectionType.Metadata ? PayloadEncoding.Cbor : PayloadEncoding.Raw
    this.#sections.push({
      type: input.type,
      data: input.data,
      version: input.version ?? 0,
      encoding: input.encoding ?? defaultEncoding,
      compression: input.compression ?? CompressionMethod.None,
      critical: input.critical ?? false,
      applicationDefinedId: input.applicationDefinedId ?? 0,
      name: input.name ?? "",
    })
    return this
  }

  async finalize(): Promise<Uint8Array> {
    const application = this.#application
    if (application === null) {
      throw new InvalidApplicationIdentifierError("application identifier is not set on writer")
    }
    const identifierBytes = encodeUtf8(application.identifier)
    const headerLength = 56 + identifierBytes.length
    const nameTableLength = this.#sections.reduce(
      (total, section) => total + encodeUtf8(section.name!).length,
      0,
    )
    const directoryLength = this.#sections.length * 48 + nameTableLength
    const directoryOffset = headerLength
    let payloadCursor = headerLength + directoryLength

    const storedPayloads: Uint8Array[] = []
    const descriptorInputs = []
    for (let i = 0; i < this.#sections.length; i += 1) {
      const section = this.#sections[i]!
      const stored = await compressPayload(section.data, section.compression!)
      storedPayloads.push(stored)
      descriptorInputs.push({
        type: section.type,
        version: section.version!,
        payloadOffset: payloadCursor,
        storedLength: stored.length,
        uncompressedLength: section.data.length,
        checksum: crc32c(stored),
        encoding: section.encoding!,
        compression: section.compression!,
        flags: section.critical! ? SECTION_FLAG_CRITICAL : SECTION_FLAG_OPTIONAL,
        applicationDefinedId: section.applicationDefinedId!,
        name: section.name!,
      })
      payloadCursor += stored.length
    }

    const digestSize = this.#fileDigest ? FILE_DIGEST_LENGTH : 0
    const fileLength = payloadCursor + digestSize
    const header = encodeHeader({
      applicationIdentifier: application.identifier,
      applicationPayloadVersion: application.payloadVersion,
      sectionCount: this.#sections.length,
      sectionDirectoryOffset: directoryOffset,
      sectionDirectoryLength: directoryLength,
      fileLength,
      fileDigestSha256: this.#fileDigest,
    })
    const { directory } = encodeSectionDirectory(descriptorInputs)
    const body = concatBytes([header, directory, ...storedPayloads], fileLength - digestSize)
    if (!this.#fileDigest) {
      return body
    }
    const digest = sha256(body)
    return concatBytes([body, digest], fileLength)
  }
}

export function createMahimWriter(options?: MahimWriterOptions): MahimWriter {
  return new MahimWriterImpl(options)
}

function validateSectionInput(input: SectionInput): void {
  if (!Number.isInteger(input.type) || input.type < 1 || input.type > 0xffffffff) {
    throw new InvalidSectionDirectoryError(
      `section type ${input.type} must be a uint32 in [1, 0xffffffff]`,
    )
  }
  if (!(input.data instanceof Uint8Array)) {
    throw new InvalidSectionDirectoryError("section data must be a Uint8Array")
  }
  const version = input.version ?? 0
  if (!Number.isInteger(version) || version < 0 || version > 0xffffffff) {
    throw new InvalidSectionDirectoryError(`section version ${version} is not a uint32`)
  }
  const defaultEncoding =
    input.type === SectionType.Metadata ? PayloadEncoding.Cbor : PayloadEncoding.Raw
  const encoding = input.encoding ?? defaultEncoding
  if (encoding !== PayloadEncoding.Raw && encoding !== PayloadEncoding.Cbor && encoding !== PayloadEncoding.Utf8) {
    throw new UnsupportedEncodingError(encoding)
  }
  const compression = input.compression ?? CompressionMethod.None
  if (compression !== CompressionMethod.None && compression !== CompressionMethod.DeflateRaw) {
    throw new UnsupportedCompressionError(compression)
  }
  const applicationDefinedId = input.applicationDefinedId ?? 0
  if (
    !Number.isInteger(applicationDefinedId) ||
    applicationDefinedId < 0 ||
    applicationDefinedId > 0xffffffff
  ) {
    throw new InvalidSectionDirectoryError(
      `application defined id ${applicationDefinedId} is not a uint32`,
    )
  }
  const name = input.name ?? ""
  if (!isValidSectionName(name)) {
    throw new InvalidSectionDirectoryError(
      `section name ${JSON.stringify(name)} is invalid or exceeds limit`,
    )
  }
  if (input.type === SectionType.Metadata) {
    if (encoding !== PayloadEncoding.Cbor) {
      throw new InvalidSectionDirectoryError("core metadata sections must use CBOR encoding")
    }
    const decoded = decodeCbor(input.data, { canonical: true })
    if (
      decoded === null ||
      typeof decoded !== "object" ||
      decoded instanceof Uint8Array ||
      Array.isArray(decoded)
    ) {
      throw new InvalidSectionDirectoryError("core metadata must be a CBOR map")
    }
    return
  }
  if (encoding === PayloadEncoding.Cbor) {
    decodeCbor(input.data, { canonical: true })
    return
  }
  if (encoding === PayloadEncoding.Utf8) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(input.data)
    } catch {
      throw new MalformedUtf8Error("utf8-encoded section data is not valid UTF-8")
    }
  }
}
