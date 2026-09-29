import hashlib
import re
import struct
import zlib

MAGIC = b"MAHIM"
FORMAT_MAJOR = 1
FORMAT_MINOR = 0
HEADER_FIXED_SIZE = 56
DESCRIPTOR_SIZE = 48
FILE_DIGEST_SIZE = 32
MAX_NAME_LENGTH = 255
MAX_APPLICATION_IDENTIFIER_LENGTH = 255
HEADER_FLAG_FILE_DIGEST_SHA256 = 0x01
SECTION_TYPE_METADATA = 1
SECTION_TYPE_APPLICATION_PAYLOAD = 2
SECTION_TYPE_ASSET = 3
SECTION_TYPE_INDEX = 4
SECTION_TYPE_EXTENSION = 5
CORE_SECTION_TYPES = frozenset(
    [
        SECTION_TYPE_METADATA,
        SECTION_TYPE_APPLICATION_PAYLOAD,
        SECTION_TYPE_ASSET,
        SECTION_TYPE_INDEX,
        SECTION_TYPE_EXTENSION,
    ]
)
ENCODING_RAW = 0
ENCODING_CBOR = 1
ENCODING_UTF8 = 2
COMPRESSION_NONE = 0
COMPRESSION_DEFLATE_RAW = 1
SECTION_FLAG_OPTIONAL = 0x0001
SECTION_FLAG_CRITICAL = 0x0002
SECTION_FLAG_RESERVED_MASK = 0xFFFC
DEFAULT_MAX_UNCOMPRESSED = 64 * 1024 * 1024
APPLICATION_IDENTIFIER_PATTERN = re.compile(r"^[a-z][a-z0-9._-]*$")


class MahimError(Exception):
    pass


class FormatError(MahimError):
    pass


class ChecksumError(MahimError):
    pass


class UnsupportedError(MahimError):
    pass


class ResourceLimitError(MahimError):
    pass


def _crc32c_table():
    table = []
    for index in range(256):
        crc = index
        for _ in range(8):
            crc = (crc >> 1) ^ 0x82F63B78 if crc & 1 else crc >> 1
        table.append(crc & 0xFFFFFFFF)
    return table


_CRC32C_TABLE = _crc32c_table()


def crc32c(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for byte in data:
        crc = _CRC32C_TABLE[(crc ^ byte) & 0xFF] ^ (crc >> 8)
    return (crc ^ 0xFFFFFFFF) & 0xFFFFFFFF


def _cbor_head(major: int, length: int) -> bytes:
    prefix = major << 5
    if length < 24:
        return bytes([prefix | length])
    if length < 0x100:
        return bytes([prefix | 24, length])
    if length < 0x10000:
        return bytes([prefix | 25]) + length.to_bytes(2, "big")
    if length < 0x100000000:
        return bytes([prefix | 26]) + length.to_bytes(4, "big")
    return bytes([prefix | 27]) + length.to_bytes(8, "big")


def encode_cbor(value) -> bytes:
    if value is False:
        return b"\xf4"
    if value is True:
        return b"\xf5"
    if value is None:
        return b"\xf6"
    if isinstance(value, int):
        if 0 <= value < 0x10000000000000000:
            return _cbor_head(0, value)
        if -0x10000000000000000 <= value < 0:
            return _cbor_head(1, -1 - value)
        raise FormatError(f"integer {value} does not fit the canonical CBOR range")
    if isinstance(value, (bytes, bytearray, memoryview)):
        payload = bytes(value)
        return _cbor_head(2, len(payload)) + payload
    if isinstance(value, str):
        payload = value.encode("utf-8")
        return _cbor_head(3, len(payload)) + payload
    if isinstance(value, (list, tuple)):
        return _cbor_head(4, len(value)) + b"".join(encode_cbor(item) for item in value)
    if isinstance(value, dict):
        pairs = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise FormatError("canonical CBOR map keys must be text strings")
            pairs.append((encode_cbor(key), encode_cbor(item)))
        pairs.sort(key=lambda pair: pair[0])
        for previous, current in zip(pairs, pairs[1:]):
            if previous[0] == current[0]:
                raise FormatError("canonical CBOR map keys must be unique")
        return _cbor_head(5, len(pairs)) + b"".join(key + val for key, val in pairs)
    raise FormatError(f"unsupported canonical CBOR value: {type(value).__name__}")


def _decode_cbor_item(data: bytes, position: int):
    if position >= len(data):
        raise FormatError("truncated CBOR data item")
    initial = data[position]
    position += 1
    major = initial >> 5
    argument = initial & 0x1F
    if argument < 24:
        length = argument
    elif argument == 24:
        if position >= len(data):
            raise FormatError("truncated CBOR head")
        length = data[position]
        position += 1
        if length < 24:
            raise FormatError("non-canonical CBOR head")
    elif argument == 25:
        if position + 2 > len(data):
            raise FormatError("truncated CBOR head")
        length = int.from_bytes(data[position : position + 2], "big")
        position += 2
        if length < 0x100:
            raise FormatError("non-canonical CBOR head")
    elif argument == 26:
        if position + 4 > len(data):
            raise FormatError("truncated CBOR head")
        length = int.from_bytes(data[position : position + 4], "big")
        position += 4
        if length < 0x10000:
            raise FormatError("non-canonical CBOR head")
    elif argument == 27:
        if position + 8 > len(data):
            raise FormatError("truncated CBOR head")
        length = int.from_bytes(data[position : position + 8], "big")
        position += 8
        if length < 0x100000000:
            raise FormatError("non-canonical CBOR head")
    else:
        raise FormatError("indefinite-length CBOR items are not allowed")
    if major == 0:
        return length, position
    if major == 1:
        return -1 - length, position
    if major in (2, 3):
        end = position + length
        if end > len(data):
            raise FormatError("truncated CBOR string")
        payload = data[position:end]
        if major == 3:
            try:
                return payload.decode("utf-8"), end
            except UnicodeDecodeError as error:
                raise FormatError("CBOR text string is not valid UTF-8") from error
        return payload, end
    if major == 4:
        items = []
        for _ in range(length):
            item, position = _decode_cbor_item(data, position)
            items.append(item)
        return items, position
    if major == 5:
        result = {}
        previous_key_bytes = None
        for _ in range(length):
            key, position = _decode_cbor_item(data, position)
            if not isinstance(key, str):
                raise FormatError("canonical CBOR map keys must be text strings")
            key_bytes = encode_cbor(key)
            if previous_key_bytes is not None and key_bytes <= previous_key_bytes:
                raise FormatError("canonical CBOR map keys must be sorted and unique")
            previous_key_bytes = key_bytes
            value, position = _decode_cbor_item(data, position)
            result[key] = value
        return result, position
    if major == 7:
        if argument == 20:
            return False, position
        if argument == 21:
            return True, position
        if argument == 22:
            return None, position
        raise FormatError("unsupported CBOR simple value")
    raise FormatError("tags and other CBOR major types are not allowed")


def decode_cbor(data: bytes):
    value, position = _decode_cbor_item(data, 0)
    if position != len(data):
        raise FormatError("trailing bytes after CBOR data item")
    return value


def _pack_header(application_identifier: bytes, payload_version: int, section_count: int, directory_offset: int, directory_length: int, file_length: int, flags: int) -> bytes:
    header_length = HEADER_FIXED_SIZE + len(application_identifier)
    header = bytearray(header_length)
    header[0:5] = MAGIC
    header[5] = FORMAT_MAJOR
    header[6] = FORMAT_MINOR
    header[7] = flags
    struct.pack_into("<I", header, 8, header_length)
    struct.pack_into("<H", header, 12, len(application_identifier))
    struct.pack_into("<I", header, 14, payload_version)
    struct.pack_into("<I", header, 18, section_count)
    struct.pack_into("<Q", header, 22, directory_offset)
    struct.pack_into("<Q", header, 30, directory_length)
    struct.pack_into("<Q", header, 38, file_length)
    header[56:] = application_identifier
    checksum_input = bytes(header)
    checksum_input = checksum_input[:46] + b"\x00\x00\x00\x00" + checksum_input[50:]
    struct.pack_into("<I", header, 46, crc32c(checksum_input))
    return bytes(header)


def _pack_descriptor(section_type: int, version: int, payload_offset: int, stored_length: int, uncompressed_length: int, payload_checksum: int, encoding: int, compression: int, flags: int, application_defined_id: int, name_length: int) -> bytes:
    descriptor = bytearray(DESCRIPTOR_SIZE)
    struct.pack_into("<I", descriptor, 0, section_type)
    struct.pack_into("<I", descriptor, 4, version)
    struct.pack_into("<Q", descriptor, 8, payload_offset)
    struct.pack_into("<Q", descriptor, 16, stored_length)
    struct.pack_into("<Q", descriptor, 24, uncompressed_length)
    struct.pack_into("<I", descriptor, 32, payload_checksum)
    descriptor[36] = encoding
    descriptor[37] = compression
    struct.pack_into("<H", descriptor, 38, flags)
    struct.pack_into("<I", descriptor, 40, application_defined_id)
    struct.pack_into("<I", descriptor, 44, name_length)
    return bytes(descriptor)


def _compress(data: bytes, compression: int) -> bytes:
    if compression == COMPRESSION_NONE:
        return data
    if compression == COMPRESSION_DEFLATE_RAW:
        compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
        return compressor.compress(data) + compressor.flush()
    raise UnsupportedError(f"unsupported compression method {compression}")


def _decompress(stored: bytes, uncompressed_length: int, compression: int, max_uncompressed: int) -> bytes:
    if uncompressed_length > max_uncompressed:
        raise ResourceLimitError(
            f"uncompressed length {uncompressed_length} exceeds limit {max_uncompressed}"
        )
    if compression == COMPRESSION_NONE:
        return stored
    if compression == COMPRESSION_DEFLATE_RAW:
        decompressor = zlib.decompressobj(-15)
        output = decompressor.decompress(stored, uncompressed_length + 1)
        output += decompressor.flush()
        if not decompressor.eof:
            raise FormatError("truncated deflate_raw stream")
        if decompressor.unused_data:
            raise FormatError("trailing bytes after deflate_raw stream")
        if len(output) != uncompressed_length:
            raise FormatError(
                f"deflate_raw stream produced {len(output)} bytes, expected {uncompressed_length}"
            )
        return output
    raise UnsupportedError(f"unsupported compression method {compression}")


def build_mahim(application_identifier: str, application_payload_version: int, sections, file_digest: bool = True) -> bytes:
    if not isinstance(application_identifier, str) or not APPLICATION_IDENTIFIER_PATTERN.match(application_identifier):
        raise FormatError(f"invalid application identifier: {application_identifier!r}")
    app_id = application_identifier.encode("utf-8")
    if len(app_id) > MAX_APPLICATION_IDENTIFIER_LENGTH:
        raise FormatError("application identifier exceeds 255 bytes")
    if not isinstance(application_payload_version, int) or not 0 <= application_payload_version <= 0xFFFFFFFF:
        raise FormatError("application payload version is not a uint32")

    prepared = []
    metadata_count = 0
    for section in sections:
        section_type = section.get("type", SECTION_TYPE_APPLICATION_PAYLOAD)
        version = section.get("version", 0)
        encoding = section.get("encoding", ENCODING_CBOR if section_type == SECTION_TYPE_METADATA else ENCODING_RAW)
        compression = section.get("compression", COMPRESSION_NONE)
        flags = section.get("flags", SECTION_FLAG_OPTIONAL)
        application_defined_id = section.get("application_defined_id", 0)
        name = section.get("name", "")
        data = bytes(section.get("data", b""))
        if not isinstance(version, int) or not 0 <= version <= 0xFFFFFFFF:
            raise FormatError("section version is not a uint32")
        if encoding not in (ENCODING_RAW, ENCODING_CBOR, ENCODING_UTF8):
            raise UnsupportedError(f"unsupported encoding {encoding}")
        if compression not in (COMPRESSION_NONE, COMPRESSION_DEFLATE_RAW):
            raise UnsupportedError(f"unsupported compression method {compression}")
        if flags & SECTION_FLAG_RESERVED_MASK or bin(flags & (SECTION_FLAG_OPTIONAL | SECTION_FLAG_CRITICAL)).count("1") != 1:
            raise FormatError(f"section flags {flags} must set exactly one of optional/critical")
        if not isinstance(application_defined_id, int) or not 0 <= application_defined_id <= 0xFFFFFFFF:
            raise FormatError("application defined id is not a uint32")
        name_bytes = name.encode("utf-8")
        if len(name_bytes) > MAX_NAME_LENGTH:
            raise FormatError("section name exceeds 255 bytes")
        if section_type == SECTION_TYPE_METADATA:
            metadata_count += 1
            if metadata_count > 1:
                raise FormatError("a file may contain at most one metadata section")
            if encoding != ENCODING_CBOR:
                raise FormatError("metadata sections must use cbor encoding")
        stored = _compress(data, compression)
        prepared.append(
            {
                "type": section_type,
                "version": version,
                "encoding": encoding,
                "compression": compression,
                "flags": flags,
                "application_defined_id": application_defined_id,
                "name": name_bytes,
                "stored": stored,
                "uncompressed_length": len(data),
            }
        )

    name_table = b"".join(item["name"] for item in prepared)
    section_count = len(prepared)
    directory_length = DESCRIPTOR_SIZE * section_count + len(name_table)
    header_length = HEADER_FIXED_SIZE + len(app_id)
    directory_offset = header_length
    payload_start = directory_offset + directory_length
    cursor = payload_start
    for item in prepared:
        item["payload_offset"] = cursor
        cursor += len(item["stored"])
    digest_size = FILE_DIGEST_SIZE if file_digest else 0
    file_length = cursor + digest_size

    flags = HEADER_FLAG_FILE_DIGEST_SHA256 if file_digest else 0
    header = _pack_header(
        app_id,
        application_payload_version,
        section_count,
        directory_offset,
        directory_length,
        file_length,
        flags,
    )
    descriptors = b"".join(
        _pack_descriptor(
            item["type"],
            item["version"],
            item["payload_offset"],
            len(item["stored"]),
            item["uncompressed_length"],
            crc32c(item["stored"]),
            item["encoding"],
            item["compression"],
            item["flags"],
            item["application_defined_id"],
            len(item["name"]),
        )
        for item in prepared
    )
    body = header + descriptors + name_table + b"".join(item["stored"] for item in prepared)
    if file_digest:
        body += hashlib.sha256(body).digest()
    return body


def parse_mahim(data: bytes) -> dict:
    if len(data) < HEADER_FIXED_SIZE:
        raise FormatError(f"file is {len(data)} bytes, too small for a MAHIM header")
    if data[0:5] != MAGIC:
        raise FormatError("magic bytes are not MAHIM")
    format_major = data[5]
    format_minor = data[6]
    if format_major != FORMAT_MAJOR:
        raise UnsupportedError(f"unsupported format version {format_major}.{format_minor}")
    header_flags = data[7]
    if header_flags & ~HEADER_FLAG_FILE_DIGEST_SHA256:
        raise FormatError(f"header flags 0x{header_flags:02x} set reserved bits")
    header_length = struct.unpack_from("<I", data, 8)[0]
    identifier_length = struct.unpack_from("<H", data, 12)[0]
    payload_version = struct.unpack_from("<I", data, 14)[0]
    section_count = struct.unpack_from("<I", data, 18)[0]
    directory_offset = struct.unpack_from("<Q", data, 22)[0]
    directory_length = struct.unpack_from("<Q", data, 30)[0]
    file_length = struct.unpack_from("<Q", data, 38)[0]
    header_checksum = struct.unpack_from("<I", data, 46)[0]
    if data[50:56] != b"\x00" * 6:
        raise FormatError("header reserved bytes must be zero")
    if header_length != HEADER_FIXED_SIZE + identifier_length:
        raise FormatError("header_length must equal 56 + application identifier length")
    if header_length > len(data):
        raise FormatError("header_length exceeds the file size")
    checksum_input = bytearray(data[:header_length])
    checksum_input[46:50] = b"\x00\x00\x00\x00"
    if crc32c(bytes(checksum_input)) != header_checksum:
        raise ChecksumError("header checksum mismatch")
    if file_length != len(data):
        raise FormatError(f"file_length {file_length} does not match physical size {len(data)}")
    if directory_offset != header_length:
        raise FormatError("section directory must immediately follow the header")
    directory_end = directory_offset + directory_length
    if directory_end > file_length:
        raise FormatError("section directory extends past the end of the file")
    try:
        identifier = data[56:header_length].decode("utf-8")
    except UnicodeDecodeError as error:
        raise FormatError("application identifier is not valid UTF-8") from error
    if not APPLICATION_IDENTIFIER_PATTERN.match(identifier):
        raise FormatError(f"invalid application identifier: {identifier!r}")

    digest_size = FILE_DIGEST_SIZE if header_flags & HEADER_FLAG_FILE_DIGEST_SHA256 else 0
    payload_region_end = file_length - digest_size
    sections = []
    name_table_start = directory_offset + DESCRIPTOR_SIZE * section_count
    name_cursor = name_table_start
    ranges = []
    metadata_count = 0
    for index in range(section_count):
        base = directory_offset + DESCRIPTOR_SIZE * index
        section_type, version = struct.unpack_from("<II", data, base)
        payload_offset = struct.unpack_from("<Q", data, base + 8)[0]
        stored_length = struct.unpack_from("<Q", data, base + 16)[0]
        uncompressed_length = struct.unpack_from("<Q", data, base + 24)[0]
        payload_checksum = struct.unpack_from("<I", data, base + 32)[0]
        encoding = data[base + 36]
        compression = data[base + 37]
        section_flags = struct.unpack_from("<H", data, base + 38)[0]
        application_defined_id = struct.unpack_from("<I", data, base + 40)[0]
        name_length = struct.unpack_from("<I", data, base + 44)[0]
        if section_flags & SECTION_FLAG_RESERVED_MASK:
            raise FormatError(f"section {index} flags set reserved bits")
        if bin(section_flags & (SECTION_FLAG_OPTIONAL | SECTION_FLAG_CRITICAL)).count("1") != 1:
            raise FormatError(f"section {index} flags must set exactly one of optional/critical")
        if name_length > MAX_NAME_LENGTH:
            raise FormatError(f"section {index} name length {name_length} exceeds 255")
        if encoding not in (ENCODING_RAW, ENCODING_CBOR, ENCODING_UTF8):
            raise UnsupportedError(f"section {index} uses unsupported encoding {encoding}")
        if compression not in (COMPRESSION_NONE, COMPRESSION_DEFLATE_RAW):
            raise UnsupportedError(f"section {index} uses unsupported compression method {compression}")
        if compression == COMPRESSION_NONE and uncompressed_length != stored_length:
            raise FormatError(f"section {index} uncompressed length must equal stored length")
        if payload_offset + stored_length > payload_region_end:
            raise FormatError(f"section {index} payload exceeds the payload region")
        if payload_offset < directory_end and stored_length > 0:
            raise FormatError(f"section {index} payload intersects header or directory")
        if name_cursor + name_length > directory_end:
            raise FormatError(f"section {index} name extends past the name table")
        try:
            name = data[name_cursor : name_cursor + name_length].decode("utf-8")
        except UnicodeDecodeError as error:
            raise FormatError(f"section {index} name is not valid UTF-8") from error
        name_cursor += name_length
        if section_type == SECTION_TYPE_METADATA:
            metadata_count += 1
            if metadata_count > 1:
                raise FormatError("a file may contain at most one metadata section")
            if encoding != ENCODING_CBOR:
                raise FormatError(f"section {index} metadata must use cbor encoding")
        if stored_length > 0:
            ranges.append((payload_offset, payload_offset + stored_length, index))
        sections.append(
            {
                "index": index,
                "type": section_type,
                "version": version,
                "payload_offset": payload_offset,
                "stored_length": stored_length,
                "uncompressed_length": uncompressed_length,
                "payload_checksum": payload_checksum,
                "encoding": encoding,
                "compression": compression,
                "flags": section_flags,
                "optional": bool(section_flags & SECTION_FLAG_OPTIONAL),
                "critical": bool(section_flags & SECTION_FLAG_CRITICAL),
                "application_defined_id": application_defined_id,
                "name_length": name_length,
                "name": name,
            }
        )
    if name_cursor != directory_end:
        raise FormatError("name table length does not match the directory length")
    ranges.sort()
    for previous, current in zip(ranges, ranges[1:]):
        if current[0] < previous[1]:
            raise FormatError(
                f"section {current[2]} payload overlaps section {previous[2]} payload"
            )
    return {
        "format_major": format_major,
        "format_minor": format_minor,
        "header_flags": header_flags,
        "file_digest": bool(header_flags & HEADER_FLAG_FILE_DIGEST_SHA256),
        "application_identifier": identifier,
        "application_payload_version": payload_version,
        "section_count": section_count,
        "file_length": file_length,
        "directory_offset": directory_offset,
        "directory_length": directory_length,
        "sections": sections,
    }


def get_section(data: bytes, parsed: dict, name_or_index, max_uncompressed: int = DEFAULT_MAX_UNCOMPRESSED) -> bytes:
    if isinstance(name_or_index, int):
        if not 0 <= name_or_index < len(parsed["sections"]):
            raise FormatError(f"section index {name_or_index} is out of range")
        section = parsed["sections"][name_or_index]
    else:
        section = next((item for item in parsed["sections"] if item["name"] == name_or_index), None)
        if section is None:
            raise FormatError(f"no section named {name_or_index!r}")
    start = section["payload_offset"]
    stored = data[start : start + section["stored_length"]]
    if crc32c(stored) != section["payload_checksum"]:
        raise ChecksumError(f"section {section['index']} payload checksum mismatch")
    output = _decompress(
        stored,
        section["uncompressed_length"],
        section["compression"],
        max_uncompressed,
    )
    if section["encoding"] == ENCODING_CBOR:
        decode_cbor(output)
    elif section["encoding"] == ENCODING_UTF8:
        try:
            output.decode("utf-8")
        except UnicodeDecodeError as error:
            raise FormatError(f"section {section['index']} is not valid UTF-8") from error
    return output


def verify_mahim(data: bytes, max_uncompressed: int = DEFAULT_MAX_UNCOMPRESSED) -> bool:
    parsed = parse_mahim(data)
    for section in parsed["sections"]:
        if section["type"] not in CORE_SECTION_TYPES and section["critical"]:
            raise UnsupportedError(
                f"unknown critical section type {section['type']} (section {section['index']})"
            )
        get_section(data, parsed, section["index"], max_uncompressed)
    if parsed["file_digest"]:
        expected = data[-FILE_DIGEST_SIZE:]
        actual = hashlib.sha256(data[:-FILE_DIGEST_SIZE]).digest()
        if actual != expected:
            raise ChecksumError("file digest mismatch")
    return True
