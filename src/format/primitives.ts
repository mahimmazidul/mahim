import { MalformedHeaderError, MalformedUtf8Error, ResourceLimitError } from "../errors/index.js"

export const MAX_SAFE_UINT64 = Number.MAX_SAFE_INTEGER

const utf8Decoder = new TextDecoder("utf-8", { fatal: true })
const utf8Encoder = new TextEncoder()

export function readUint8(bytes: Uint8Array, offset: number): number {
  assertReadable(bytes, offset, 1)
  return bytes[offset]!
}

export function readUint16LE(bytes: Uint8Array, offset: number): number {
  assertReadable(bytes, offset, 2)
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

export function readUint32LE(bytes: Uint8Array, offset: number): number {
  assertReadable(bytes, offset, 4)
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  )
}

export function readUint64LE(bytes: Uint8Array, offset: number): number {
  assertReadable(bytes, offset, 8)
  const low = readUint32LE(bytes, offset)
  const high = readUint32LE(bytes, offset + 4)
  const value = high * 0x100000000 + low
  if (!Number.isSafeInteger(value)) {
    throw new ResourceLimitError("uint64 field exceeds safe integer range")
  }
  return value
}

export function writeUint8(bytes: Uint8Array, offset: number, value: number): void {
  assertWritable(bytes, offset, 1)
  bytes[offset] = value & 0xff
}

export function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  assertWritable(bytes, offset, 2)
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

export function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  assertWritable(bytes, offset, 4)
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
  bytes[offset + 3] = (value >>> 24) & 0xff
}

export function writeUint64LE(bytes: Uint8Array, offset: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ResourceLimitError("uint64 value must be a non-negative safe integer")
  }
  assertWritable(bytes, offset, 8)
  const low = value % 0x100000000
  const high = Math.floor(value / 0x100000000)
  writeUint32LE(bytes, offset, low)
  writeUint32LE(bytes, offset + 4, high)
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes)
  } catch {
    throw new MalformedUtf8Error()
  }
}

export function encodeUtf8(value: string): Uint8Array {
  return utf8Encoder.encode(value)
}

export function concatBytes(parts: readonly Uint8Array[], totalLength?: number): Uint8Array {
  let total = totalLength ?? 0
  if (totalLength === undefined) {
    for (const part of parts) {
      total += part.length
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
}

export function checkedAdd(a: number, b: number, label = "range"): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0) {
    throw new ResourceLimitError(`${label} operands out of range`)
  }
  const sum = a + b
  if (!Number.isSafeInteger(sum)) {
    throw new ResourceLimitError(`${label} overflows safe integer range`)
  }
  return sum
}

function assertReadable(bytes: Uint8Array, offset: number, size: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0) {
    throw new MalformedHeaderError(`invalid read at offset ${offset} size ${size}`)
  }
  if (offset + size > bytes.length) {
    throw new MalformedHeaderError(
      `read of ${size} bytes at offset ${offset} exceeds buffer length ${bytes.length}`,
    )
  }
}

function assertWritable(bytes: Uint8Array, offset: number, size: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0) {
    throw new MalformedHeaderError(`invalid write at offset ${offset} size ${size}`)
  }
  if (offset + size > bytes.length) {
    throw new MalformedHeaderError(
      `write of ${size} bytes at offset ${offset} exceeds buffer length ${bytes.length}`,
    )
  }
}
