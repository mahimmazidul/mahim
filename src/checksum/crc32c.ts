const CRC32C_POLYNOMIAL = 0x82f63b78

const CRC32C_TABLE = buildTable()

function buildTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (value >>> 1) ^ CRC32C_POLYNOMIAL : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
}

export function crc32c(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32C_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
