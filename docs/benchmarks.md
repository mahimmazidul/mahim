# MAHIM benchmarks

Environment: Node.js v20.20.2, linux x64

Measured with `npm run bench` (median of repeated runs).

- write small metadata file: median 0.02 ms (min 0.01 ms, max 0.67 ms, n=200)
- open+list small metadata file: median 0.01 ms (min 0.01 ms, max 1.17 ms, n=200)
- parse header small file: median 0.00 ms (min 0.00 ms, max 0.14 ms, n=200)
- write 10 MB binary asset: median 33.27 ms (min 30.50 ms, max 35.65 ms, n=5)
- open+list 10 MB binary asset: median 0.01 ms (min 0.01 ms, max 0.13 ms, n=20)
- single-section access 10 MB (full read+checksum): median 27.93 ms (min 23.09 ms, max 36.46 ms, n=20)
- write 100 MB binary asset: median 334.22 ms (min 332.26 ms, max 338.07 ms, n=3)
- open+list 100 MB binary asset: median 0.01 ms (min 0.01 ms, max 3.56 ms, n=10)
- single-section access 100 MB (full read+checksum): median 311.64 ms (min 294.93 ms, max 340.17 ms, n=5)
- write 10 MB text asset (deflate_raw): median 29.75 ms (min 29.68 ms, max 37.85 ms, n=3)
- open+list compressed 10 MB text: median 0.01 ms (min 0.01 ms, max 0.09 ms, n=10)
- compressed section read (checksum+inflate): median 37.67 ms (min 23.21 ms, max 47.55 ms, n=10)
- write 1000 small sections: median 3.14 ms (min 1.24 ms, max 13.78 ms, n=10)
- open+list 1000 small sections: median 0.39 ms (min 0.27 ms, max 5.16 ms, n=50)
- verify 10 MB file (checksums only): median 27.04 ms (min 22.40 ms, max 29.62 ms, n=10)

Notes:
- Write timings include compression and checksum computation.
- Read timings (`open+list`) cover header and directory parsing only.
- Single-section access reads and checksums only the selected section.
- DEFLATE timings depend on the platform compression implementation.
