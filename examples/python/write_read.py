import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mahim_lite as ml


def main() -> int:
    image_like = bytes((index * 7) & 0xFF for index in range(2048))

    file_bytes = ml.build_mahim(
        "com.example.tool",
        1,
        [
            {
                "type": ml.SECTION_TYPE_METADATA,
                "name": "meta",
                "encoding": ml.ENCODING_CBOR,
                "data": ml.encode_cbor(
                    {"title": "Write/read example", "createdAt": "2026-09-30"}
                ),
            },
            {
                "type": ml.SECTION_TYPE_APPLICATION_PAYLOAD,
                "name": "payload",
                "encoding": ml.ENCODING_UTF8,
                "data": "hello from MAHIM".encode("utf-8"),
            },
            {
                "type": ml.SECTION_TYPE_ASSET,
                "name": "image",
                "compression": ml.COMPRESSION_DEFLATE_RAW,
                "data": image_like,
            },
        ],
        file_digest=True,
    )

    output_path = Path(__file__).resolve().parent / "write-read.mahim"
    output_path.write_bytes(file_bytes)

    parsed = ml.parse_mahim(file_bytes)
    print(f"format: MAHIM {parsed['format_major']}.{parsed['format_minor']}")
    print(
        f"application: {parsed['application_identifier']} "
        f"v{parsed['application_payload_version']}"
    )
    for section in parsed["sections"]:
        print(
            f"section {section['index']}: {section['name']} "
            f"(type {section['type']}, {section['stored_length']} stored bytes)"
        )

    metadata = ml.decode_cbor(ml.get_section(file_bytes, parsed, "meta"))
    print(f"metadata: {metadata}")
    payload = ml.get_section(file_bytes, parsed, "payload").decode("utf-8")
    print(f"payload: {payload}")

    restored_image = ml.get_section(file_bytes, parsed, "image")
    print(f"image restored: {restored_image == image_like}")

    ml.verify_mahim(file_bytes)
    print("integrity: valid")

    round_trip_ok = restored_image == image_like
    print(f"round trip: {'identical' if round_trip_ok else 'FAILED'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
