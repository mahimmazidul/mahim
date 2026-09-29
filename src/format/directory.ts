import { InvalidSectionDirectoryError, ResourceLimitError } from "../errors/index.js"
import { SectionType, type ParserLimits } from "./constants.js"
import { encodeUtf8, decodeUtf8, checkedAdd } from "./primitives.js"
import {
  decodeSectionDescriptor,
  encodeSectionDescriptor,
  type SectionDescriptor,
  type SectionDescriptorInput,
} from "./section.js"
import type { MahimHeader } from "./header.js"

export interface SectionDirectory {
  readonly descriptors: readonly SectionDescriptor[]
  readonly nameTable: Uint8Array
  readonly length: number
}

export function encodeSectionDirectory(
  inputs: readonly SectionDescriptorInput[],
): { directory: Uint8Array; nameTableOffsets: number[] } {
  const nameParts: Uint8Array[] = []
  const nameTableOffsets: number[] = []
  let nameTableLength = 0
  for (const input of inputs) {
    nameTableOffsets.push(nameTableLength)
    const nameBytes = encodeUtf8(input.name)
    nameParts.push(nameBytes)
    nameTableLength += nameBytes.length
  }
  const descriptorBytesLength = inputs.length * 48
  const directory = new Uint8Array(descriptorBytesLength + nameTableLength)
  for (let i = 0; i < inputs.length; i += 1) {
    directory.set(encodeSectionDescriptor(inputs[i]!), i * 48)
  }
  let nameOffset = descriptorBytesLength
  for (const part of nameParts) {
    directory.set(part, nameOffset)
    nameOffset += part.length
  }
  return { directory, nameTableOffsets }
}

export function decodeSectionDirectory(
  directoryBytes: Uint8Array,
  header: MahimHeader,
  limits: ParserLimits,
): SectionDescriptor[] {
  const count = header.sectionCount
  const descriptorsLength = count * 48
  if (directoryBytes.length < descriptorsLength) {
    throw new InvalidSectionDirectoryError(
      "section directory shorter than section_count descriptors",
    )
  }
  const nameTableLength = directoryBytes.length - descriptorsLength
  const expectedLength = checkedAdd(descriptorsLength, nameTableLength, "directory")
  if (expectedLength !== header.sectionDirectoryLength) {
    throw new InvalidSectionDirectoryError(
      `section_directory_length ${header.sectionDirectoryLength} does not match parsed length ${expectedLength}`,
    )
  }
  const descriptors: SectionDescriptor[] = []
  let nameCursor = descriptorsLength
  let metadataSections = 0
  for (let i = 0; i < count; i += 1) {
    const descriptor = decodeSectionDescriptor(directoryBytes, i * 48, i, limits)
    const rawNameLength = readNameLength(directoryBytes, i * 48)
    if (nameCursor + rawNameLength > directoryBytes.length) {
      throw new InvalidSectionDirectoryError("section name table truncated")
    }
    const nameBytes = directoryBytes.slice(nameCursor, nameCursor + rawNameLength)
    nameCursor += rawNameLength
    const name = decodeUtf8(nameBytes)
    if (descriptor.type === SectionType.Metadata) {
      metadataSections += 1
      if (metadataSections > 1) {
        throw new InvalidSectionDirectoryError("multiple core metadata sections")
      }
    }
    descriptors.push({ ...descriptor, name })
  }
  if (nameCursor !== directoryBytes.length) {
    throw new InvalidSectionDirectoryError("section name table has trailing bytes")
  }
  return descriptors
}

function readNameLength(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset + 44]! |
      (bytes[offset + 45]! << 8) |
      (bytes[offset + 46]! << 16) |
      (bytes[offset + 47]! << 24)) >>>
    0
  )
}

export function directoryLengthFor(
  descriptors: readonly Pick<SectionDescriptorInput, "name">[],
): number {
  let nameTableLength = 0
  for (const descriptor of descriptors) {
    nameTableLength += encodeUtf8(descriptor.name).length
  }
  return descriptors.length * 48 + nameTableLength
}

export function assertDirectoryWithinLimits(
  length: number,
  limits: ParserLimits,
): void {
  if (length > limits.maxSectionDirectoryLength) {
    throw new ResourceLimitError(
      `section directory length ${length} exceeds limit ${limits.maxSectionDirectoryLength}`,
    )
  }
}
