import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mahim_lite as ml


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 examples/python/inspect.py <file.mahim>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    try:
        data = path.read_bytes()
    except OSError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    try:
        parsed = ml.parse_mahim(data)
    except ml.MahimError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print("Format:                  ", f"MAHIM {parsed['format_major']}.{parsed['format_minor']}")
    print("Application:             ", parsed["application_identifier"])
    print("Application payload ver: ", parsed["application_payload_version"])
    print("Sections:                ", parsed["section_count"])
    print("File size:               ", parsed["file_length"], "bytes")
    print("File digest:             ", "sha256" if parsed["file_digest"] else "none")

    print("")
    print("Sections:")
    for section in parsed["sections"]:
        print(
            f"  [{section['index']}] {section['name'] or '(unnamed)'} "
            f"type={section['type']} enc={section['encoding']} comp={section['compression']} "
            f"stored={section['stored_length']} size={section['uncompressed_length']} "
            f"{'critical' if section['critical'] else 'optional'}"
        )

    print("")
    try:
        ml.verify_mahim(data)
    except ml.MahimError as error:
        print("Integrity: invalid")
        print(f"error: {error}", file=sys.stderr)
        return 1
    print("Integrity: valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
