import {
  MalformedSectionError,
  ResourceLimitError,
  UnsupportedCompressionError,
} from "../errors/index.js"
import { CompressionMethod } from "../format/constants.js"
import { concatBytes } from "../format/primitives.js"

export interface DecompressionLimits {
  readonly maxUncompressedLength: number
  readonly maxRatio: number
}

export async function compressPayload(
  data: Uint8Array,
  method: number,
): Promise<Uint8Array> {
  if (method === CompressionMethod.None) {
    return data
  }
  if (method !== CompressionMethod.DeflateRaw) {
    throw new UnsupportedCompressionError(method)
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function decompressPayload(
  stored: Uint8Array,
  method: number,
  uncompressedLength: number,
  limits: DecompressionLimits,
): Promise<Uint8Array> {
  if (method === CompressionMethod.None) {
    if (stored.length !== uncompressedLength) {
      throw new MalformedSectionError(
        `uncompressed_length ${uncompressedLength} does not match stored length ${stored.length}`,
      )
    }
    return stored
  }
  if (method !== CompressionMethod.DeflateRaw) {
    throw new UnsupportedCompressionError(method)
  }
  if (uncompressedLength > limits.maxUncompressedLength) {
    throw new ResourceLimitError(
      `declared uncompressed length ${uncompressedLength} exceeds limit ${limits.maxUncompressedLength}`,
    )
  }
  if (
    limits.maxRatio > 0 &&
    stored.length > 0 &&
    uncompressedLength / stored.length > limits.maxRatio
  ) {
    throw new ResourceLimitError(
      `compression ratio exceeds limit ${limits.maxRatio}`,
    )
  }
  const stream = new Blob([stored as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      const chunk = value as Uint8Array
      total += chunk.length
      if (total > uncompressedLength) {
        await reader.cancel()
        throw new MalformedSectionError(
          "decompressed output exceeds declared uncompressed_length",
        )
      }
      if (total > limits.maxUncompressedLength) {
        await reader.cancel()
        throw new ResourceLimitError("decompressed output exceeds limit")
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof MalformedSectionError || error instanceof ResourceLimitError) {
      throw error
    }
    throw new MalformedSectionError("failed to decompress section payload")
  } finally {
    reader.releaseLock()
  }
  if (total !== uncompressedLength) {
    throw new MalformedSectionError(
      `decompressed size ${total} does not match uncompressed_length ${uncompressedLength}`,
    )
  }
  return concatBytes(chunks, total)
}
