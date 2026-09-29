import { CborDecodeError } from "../errors/index.js"
import { encodeUtf8, decodeUtf8 } from "../format/primitives.js"

export type CborValue =
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | readonly CborValue[]
  | { readonly [key: string]: CborValue }

interface EncodeContext {
  parts: Uint8Array[]
  keyScratch: Array<{ key: string; encoded: Uint8Array }>
}

const MAJOR_UNSIGNED = 0
const MAJOR_NEGATIVE = 1
const MAJOR_BYTE_STRING = 2
const MAJOR_TEXT_STRING = 3
const MAJOR_ARRAY = 4
const MAJOR_MAP = 5
const MAJOR_TAG = 6
const MAJOR_SIMPLE = 7

export function encodeCbor(value: CborValue): Uint8Array {
  const parts: Uint8Array[] = []
  encodeValue(value, { parts, keyScratch: [] })
  let total = 0
  for (const part of parts) {
    total += part.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export interface DecodeCborOptions {
  readonly canonical?: boolean
}

export function decodeCbor(bytes: Uint8Array, options?: DecodeCborOptions): CborValue {
  const canonical = options?.canonical ?? true
  const state = { bytes, offset: 0, canonical }
  const value = decodeItem(state, 0)
  if (state.offset !== bytes.length) {
    throw new CborDecodeError("trailing bytes after CBOR item")
  }
  return value
}

function encodeValue(value: CborValue, context: EncodeContext): void {
  if (value === null) {
    context.parts.push(new Uint8Array([0xf6]))
    return
  }
  if (value === false) {
    context.parts.push(new Uint8Array([0xf4]))
    return
  }
  if (value === true) {
    context.parts.push(new Uint8Array([0xf5]))
    return
  }
  if (typeof value === "number") {
    encodeNumber(value, context)
    return
  }
  if (typeof value === "string") {
    const body = encodeUtf8(value)
    context.parts.push(encodeHead(MAJOR_TEXT_STRING, body.length))
    context.parts.push(body)
    return
  }
  if (value instanceof Uint8Array) {
    context.parts.push(encodeHead(MAJOR_BYTE_STRING, value.length))
    context.parts.push(value)
    return
  }
  if (Array.isArray(value)) {
    context.parts.push(encodeHead(MAJOR_ARRAY, value.length))
    for (const item of value) {
      encodeValue(item, context)
    }
    return
  }
  encodeMap(value as { readonly [key: string]: CborValue }, context)
}

function encodeNumber(value: number, context: EncodeContext): void {
  if (!Number.isInteger(value)) {
    throw new CborDecodeError("floating-point numbers are not allowed in MAHIM canonical CBOR")
  }
  if (value >= 0) {
    if (!Number.isSafeInteger(value)) {
      throw new CborDecodeError("integer exceeds safe range")
    }
    context.parts.push(encodeHead(MAJOR_UNSIGNED, value))
    return
  }
  const magnitude = -1 - value
  if (!Number.isSafeInteger(magnitude)) {
    throw new CborDecodeError("integer exceeds safe range")
  }
  context.parts.push(encodeHead(MAJOR_NEGATIVE, magnitude))
}

function encodeMap(map: { readonly [key: string]: CborValue }, context: EncodeContext): void {
  const keys = Object.keys(map)
  const entries: Array<{ key: string; encodedKey: Uint8Array }> = []
  for (const key of keys) {
    const encodedKey = encodeHead(MAJOR_TEXT_STRING, utf8Length(key))
    const keyBytes = new Uint8Array(encodedKey.length + utf8Length(key))
    keyBytes.set(encodedKey, 0)
    keyBytes.set(encodeUtf8(key), encodedKey.length)
    entries.push({ key, encodedKey: keyBytes })
  }
  entries.sort((a, b) => compareBytes(a.encodedKey, b.encodedKey))
  context.parts.push(encodeHead(MAJOR_MAP, entries.length))
  for (const entry of entries) {
    context.parts.push(entry.encodedKey)
    encodeValue(map[entry.key]!, context)
  }
}

function utf8Length(value: string): number {
  return encodeUtf8(value).length
}

function encodeHead(major: number, value: number): Uint8Array {
  const majorBits = major << 5
  if (value < 24) {
    return new Uint8Array([majorBits | value])
  }
  if (value <= 0xff) {
    return new Uint8Array([majorBits | 24, value])
  }
  if (value <= 0xffff) {
    return new Uint8Array([majorBits | 25, (value >>> 8) & 0xff, value & 0xff])
  }
  if (value <= 0xffffffff) {
    return new Uint8Array([
      majorBits | 26,
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ])
  }
  const high = Math.floor(value / 0x100000000)
  const low = value % 0x100000000
  return new Uint8Array([
    majorBits | 27,
    (high / 0x1000000) & 0xff,
    (high / 0x10000) & 0xff,
    (high / 0x100) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
  ])
}

interface DecodeState {
  bytes: Uint8Array
  offset: number
  canonical: boolean
}

function decodeItem(state: DecodeState, depth: number): CborValue {
  if (depth > 32) {
    throw new CborDecodeError("CBOR nesting too deep")
  }
  const initial = readByte(state)
  const major = initial >> 5
  const info = initial & 0x1f
  switch (major) {
    case MAJOR_UNSIGNED:
      return readArgument(state, info, initial)
    case MAJOR_NEGATIVE: {
      const magnitude = readArgument(state, info, initial)
      return -1 - magnitude
    }
    case MAJOR_BYTE_STRING: {
      const length = readArgument(state, info, initial)
      return readBytes(state, length)
    }
    case MAJOR_TEXT_STRING: {
      const length = readArgument(state, info, initial)
      return decodeUtf8(readBytes(state, length))
    }
    case MAJOR_ARRAY: {
      const length = readArgument(state, info, initial)
      const items: CborValue[] = []
      for (let i = 0; i < length; i += 1) {
        items.push(decodeItem(state, depth + 1))
      }
      return items
    }
    case MAJOR_MAP: {
      const length = readArgument(state, info, initial)
      return decodeMap(state, length, depth)
    }
    case MAJOR_TAG:
      throw new CborDecodeError("tags are not allowed in MAHIM canonical CBOR")
    case MAJOR_SIMPLE:
      return decodeSimple(info, initial)
    default:
      throw new CborDecodeError("invalid CBOR major type")
  }
}

function decodeMap(state: DecodeState, length: number, depth: number): { [key: string]: CborValue } {
  const result: { [key: string]: CborValue } = {}
  let previousKey: Uint8Array | null = null
  for (let i = 0; i < length; i += 1) {
    const keyOffset = state.offset
    const keyItem = decodeItem(state, depth + 1)
    if (typeof keyItem !== "string") {
      throw new CborDecodeError("map keys must be text strings")
    }
    const encodedKey = state.bytes.slice(keyOffset, state.offset)
    if (previousKey !== null) {
      if (compareBytes(encodedKey, previousKey) <= 0) {
        if (compareBytes(encodedKey, previousKey) === 0) {
          throw new CborDecodeError("duplicate map key")
        }
        if (state.canonical) {
          throw new CborDecodeError("map keys are not in canonical order")
        }
      }
    }
    previousKey = encodedKey
    result[keyItem] = decodeItem(state, depth + 1)
  }
  return result
}

function decodeSimple(info: number, initial: number): boolean | null {
  if (info < 24) {
    if (info === 20) {
      return false
    }
    if (info === 21) {
      return true
    }
    if (info === 22) {
      return null
    }
    throw new CborDecodeError(`unsupported simple value ${info}`)
  }
  if (info === 24) {
    throw new CborDecodeError("unsupported simple value")
  }
  if (info === 25 || info === 26 || info === 27) {
    void initial
    throw new CborDecodeError("floating-point numbers are not allowed in MAHIM canonical CBOR")
  }
  if (info === 31) {
    throw new CborDecodeError("indefinite-length items are not allowed")
  }
  throw new CborDecodeError("invalid simple value")
}

function readArgument(state: DecodeState, info: number, initial: number): number {
  if (info < 24) {
    return info
  }
  if (info === 24) {
    const value = readByte(state)
    if (state.canonical && value < 24) {
      throw new CborDecodeError("non-canonical length encoding")
    }
    return value
  }
  if (info === 25) {
    const value = (readByte(state) << 8) | readByte(state)
    if (state.canonical && value <= 0xff) {
      throw new CborDecodeError("non-canonical length encoding")
    }
    return value
  }
  if (info === 26) {
    let value = 0
    for (let i = 0; i < 4; i += 1) {
      value = value * 256 + readByte(state)
    }
    if (state.canonical && value <= 0xffff) {
      throw new CborDecodeError("non-canonical length encoding")
    }
    return value
  }
  if (info === 27) {
    let value = 0
    for (let i = 0; i < 8; i += 1) {
      value = value * 256 + readByte(state)
    }
    if (!Number.isSafeInteger(value)) {
      throw new CborDecodeError("length exceeds safe integer range")
    }
    if (state.canonical && value <= 0xffffffff) {
      throw new CborDecodeError("non-canonical length encoding")
    }
    return value
  }
  if (info === 31) {
    void initial
    throw new CborDecodeError("indefinite-length items are not allowed")
  }
  throw new CborDecodeError("invalid CBOR argument")
}

function readBytes(state: DecodeState, length: number): Uint8Array {
  if (length < 0 || state.offset + length > state.bytes.length) {
    throw new CborDecodeError("CBOR item exceeds buffer")
  }
  const slice = state.bytes.slice(state.offset, state.offset + length)
  state.offset += length
  return slice
}

function readByte(state: DecodeState): number {
  if (state.offset >= state.bytes.length) {
    throw new CborDecodeError("unexpected end of CBOR data")
  }
  const value = state.bytes[state.offset]!
  state.offset += 1
  return value
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i += 1) {
    const diff = a[i]! - b[i]!
    if (diff !== 0) {
      return diff < 0 ? -1 : 1
    }
  }
  if (a.length === b.length) {
    return 0
  }
  return a.length < b.length ? -1 : 1
}
