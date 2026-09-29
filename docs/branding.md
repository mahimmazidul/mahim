# MAHIM brand and visual identity

This document describes the official MAHIM visual identity: the symbol, the
wordmark, the logo lockups, and the `.mahim` file icon. The identity is
intended to be restrained, professional, and long-lived.

## Design idea

The symbol expresses the format itself: **a container with internal
sections**. A simple geometric outer container holds three modular shapes with
staggered widths — a directory of distinct sections inside one bounded file.
The symbol is:

- geometric and static — rectangles only, no gradients, glow, shadows, or 3D
- recognizable at 16, 24, 32, and 64 pixel sizes
- monochrome-capable — it works filled in a single color
- independent of the letters "M" or "MAHIM"

## Files

| File | Purpose |
|---|---|
| [assets/brand/mahim-symbol.svg](../assets/brand/mahim-symbol.svg) | Canonical symbol (24 × 24 grid) |
| [assets/brand/mahim-wordmark.svg](../assets/brand/mahim-wordmark.svg) | Wordmark "MAHIM" (geometric sans construction) |
| [assets/brand/mahim-horizontal.svg](../assets/brand/mahim-horizontal.svg) | Primary horizontal lockup |
| [assets/brand/mahim-vertical.svg](../assets/brand/mahim-vertical.svg) | Vertical/compact lockup |
| [assets/brand/mahim-monochrome.svg](../assets/brand/mahim-monochrome.svg) | Single-color black lockup |
| [assets/brand/mahim-inverted.svg](../assets/brand/mahim-inverted.svg) | White lockup for dark backgrounds |
| [assets/file-icons/mahim-file.svg](../assets/file-icons/mahim-file.svg) | Official `.mahim` file icon (48 × 48 grid) |
| [assets/file-icons/png/<size>/mahim-file.png](../assets/file-icons/png/) | Raster file icons: 16, 24, 32, 48, 64, 128, 256, 512 px |
| [assets/file-icons/mahim-file.ico](../assets/file-icons/mahim-file.ico) | Windows multi-size icon (16–256 px) |

All SVGs are canonical sources: plain fill paths with a valid `viewBox`, no
embedded rasters, no external references, no scripts, no animation, no
embedded fonts. Raster files are generated derivatives and can be regenerated
at any time.

## Symbol and lockup previews

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/mahim-inverted.svg">
  <img src="assets/brand/mahim-horizontal.svg" alt="MAHIM horizontal lockup" width="260">
</picture>

| Symbol | Vertical lockup | File icon |
|---|---|---|
| <img src="assets/brand/mahim-symbol.svg" alt="MAHIM symbol" width="56"> | <img src="assets/brand/mahim-vertical.svg" alt="MAHIM vertical lockup" width="120"> | <img src="assets/file-icons/mahim-file.svg" alt=".mahim file icon" width="56"> |

## Colors

| Role | Value |
|---|---|
| Symbol and monochrome ink | `#000000` |
| Inverted ink | `#FFFFFF` |
| Wordmark gray (two-tone lockups) | `#4B5158` |
| File icon paper | `#FFFFFF` |

The primary lockups are two-tone: a black symbol with a dark-gray wordmark.
The monochrome variant is flat black; the inverted variant is flat white and
belongs on dark backgrounds. The symbol alone is always solid black (or solid
white when inverted).

## Usage rules

- Use the official files; do not redraw, re-letter, outline, or recolor the
  symbol with arbitrary colors.
- Keep clear space around the mark of at least the symbol's frame stroke width
  (1/12 of the symbol height).
- Do not add effects: no gradients, glows, bevels, drop shadows, outlines, or
  animation.
- Do not stretch, rotate, or crop the mark.
- The wordmark is secondary to the symbol. Use the horizontal lockup when
  there is room for the name, the symbol alone where space is tight, and the
  vertical lockup for square/stacked placements.
- Minimum sizes: symbol 16 px; horizontal lockup 80 px wide; file icon 16 px.

## File icon

The `.mahim` file icon uses the canonical symbol in a dominant position inside
a restrained document silhouette with a folded corner. The silhouette only
says "this is a file"; the symbol carries the identity. There is no small
unreadable text on the icon.

Raster derivatives are generated from the vector source at 16, 24, 32, 48, 64,
128, 256, and 512 pixels:

```bash
node scripts/generate-icons.mjs
```

The script requires ImageMagick (`magick`) and writes
`assets/file-icons/png/<size>/mahim-file.png` plus the multi-size
`assets/file-icons/mahim-file.ico` used on Windows. The script is
deterministic: the same SVG produces the same rasters.

The icon appears in a file manager only when a MAHIM-aware application
registers the `.mahim` extension or MIME type on the system. File contents
cannot force an operating system to display a particular icon. See
[file-associations.md](file-associations.md) for platform guidance.

## Media type and extension

- Canonical file extension: `.mahim`
- Media type: `application/x-mahim` (provisional). It is not registered with
  IANA and this project does not claim registration.
