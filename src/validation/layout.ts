import { SectionBoundsError, SectionOverlapError } from "../errors/index.js"
import { checkedAdd } from "../format/primitives.js"
import type { SectionDescriptor } from "../format/section.js"

export interface FileLayout {
  readonly headerLength: number
  readonly directoryOffset: number
  readonly directoryLength: number
  readonly fileLength: number
  readonly digestSize: number
}

export function validateSectionLayout(
  descriptors: readonly SectionDescriptor[],
  layout: FileLayout,
): void {
  const regionStart = checkedAdd(layout.directoryOffset, layout.directoryLength, "directory end")
  const regionEnd = layout.fileLength - layout.digestSize
  if (regionStart > regionEnd) {
    throw new SectionBoundsError("file has no space for section payloads")
  }
  const ranges: Array<{ index: number; start: number; end: number }> = []
  for (const descriptor of descriptors) {
    const end = checkedAdd(descriptor.payloadOffset, descriptor.storedLength, "payload range")
    if (descriptor.payloadOffset < regionStart) {
      throw new SectionBoundsError(
        `section ${descriptor.index} payload starts before the payload region`,
      )
    }
    if (end > regionEnd) {
      throw new SectionBoundsError(
        `section ${descriptor.index} payload ends beyond the payload region`,
      )
    }
    if (descriptor.storedLength > 0) {
      ranges.push({ index: descriptor.index, start: descriptor.payloadOffset, end })
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  for (let i = 1; i < ranges.length; i += 1) {
    const previous = ranges[i - 1]!
    const current = ranges[i]!
    if (current.start < previous.end) {
      throw new SectionOverlapError(
        `section ${current.index} payload overlaps section ${previous.index} payload`,
      )
    }
  }
}
