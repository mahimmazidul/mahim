# `.mahim` file associations and platform icon registration

This document is guidance for applications that open `.mahim` files. This
repository ships assets and documentation only — no installers and no
system-level registration code.

## Canonical identifiers

- File extension: `.mahim`
- Media type: `application/x-mahim` (provisional)

The media type is provisional. It is **not** registered with IANA, and this
project does not claim registration. Inside a MAHIM implementation, file
identification is always by the magic byte sequence and header, never by the
extension or media type (see [spec/mahim-v1.md](../spec/mahim-v1.md)).

## The one rule that matters

Operating systems display the official `.mahim` icon **only after a
MAHIM-aware application registers the extension or MIME type on that
system**. A file's contents cannot assign, force, or override its own icon.
Without a registered handler, `.mahim` files appear with the platform's
generic unknown-file icon — this is expected behavior, not a defect in the
assets.

Registration belongs in the installer or first-run setup of a MAHIM-aware
application. The sections below show what such registration looks like on each
platform; they are examples to adapt, not shipped code.

## Windows

Windows uses icon resources and registry associations.

1. Build a multi-size `.ico` from the vector source
   ([`assets/file-icons/mahim-file.ico`](../assets/file-icons/mahim-file.ico)
   is provided, containing 16, 32, 48, 64, 128, and 256 px frames; regenerate
   with `node scripts/generate-icons.mjs` if needed).
2. Register a ProgID and point the `.mahim` extension at it:

```reg
Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\.mahim]
@="MahimFile"
"Content Type"="application/x-mahim"
"PerceivedType"="data"

[HKEY_CLASSES_ROOT\MahimFile]
@="MAHIM container file"

[HKEY_CLASSES_ROOT\MahimFile\DefaultIcon]
@="C:\\Program Files\\MyApp\\mahim-file.ico,0"

[HKEY_CLASSES_ROOT\MahimFile\shell\open\command]
@="\"C:\\Program Files\\MyApp\\myapp.exe\" \"%1\""
```

Use per-user registration (`HKEY_CURRENT_USER\Software\Classes`) when the
application does not need machine-wide installation. After registration,
restart Explorer or notify the shell so the icon cache refreshes.

## macOS

macOS declares a document type (UTI) in the application's `Info.plist`. The
system renders the icon from the app bundle's icon resources.

```xml
<key>CFBundleDocumentTypes</key>
<array>
  <dict>
    <key>CFBundleTypeName</key>
    <string>MAHIM container file</string>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>LSHandlerRank</key>
    <string>Owner</string>
    <key>LSItemContentTypes</key>
    <array>
      <string>dev.mahim.container</string>
    </array>
    <key>CFBundleTypeIconFile</key>
    <string>mahim-file.icns</string>
  </dict>
</array>
<key>UTExportedTypeDeclarations</key>
<array>
  <dict>
    <key>UTTypeIdentifier</key>
    <string>dev.mahim.container</string>
    <key>UTTypeDescription</key>
    <string>MAHIM container file</string>
    <key>UTTypeConformsTo</key>
    <array>
      <string>public.data</string>
    </array>
    <key>UTTypeTagSpecification</key>
    <dict>
      <key>public.filename-extension</key>
      <array>
        <string>mahim</string>
      </array>
      <key>public.mime-type</key>
      <string>application/x-mahim</string>
    </dict>
  </dict>
</array>
```

Build `mahim-file.icns` from the generated PNGs (`iconutil` on a
`.iconset` folder containing the 16–512 px sizes). Applications that open
MAHIM files but do not claim ownership should use `LSHandlerRank` =
`Alternate` and declare `UTTypeConformsTo` = `public.data` in an imported
type declaration instead.

## Linux (freedesktop)

Linux desktops use shared MIME info and desktop entries.

1. Install a MIME description, for example
   `/usr/share/mime/packages/mahim.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-mahim">
    <comment>MAHIM container file</comment>
    <glob pattern="*.mahim"/>
    <magic priority="80">
      <match type="string" value="MAHIM" offset="0"/>
    </magic>
  </mime-type>
</mime-info>
```

2. Run `update-mime-database /usr/share/mime` after installing the file.
3. Ship the PNG icons at
   `/usr/share/icons/hicolor/<size>/mimetypes/application-x-mahim.png`
   (the generated `assets/file-icons/png/<size>/mahim-file.png` files can be
   copied and renamed), then run `gtk-update-icon-cache` on the hicolor theme.
4. Declare the MIME type in the application's `.desktop` entry via
   `MimeType=application/x-mahim;` so the file manager links the extension to
   the application.

## Android

Android has no per-extension icon registration. Declare the MIME type on the
activity that opens MAHIM files:

```xml
<activity android:name=".MahimViewer">
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <data android:mimeType="application/x-mahim"/>
  </intent-filter>
</activity>
```

Open files through `content://` URIs with the MIME type set to
`application/x-mahim`; the system picker routes them to registered handlers.
Icon display in "Files" style apps is controlled by those apps, not by the
file.

## Summary

| Platform | Mechanism | Provided asset |
|---|---|---|
| Windows | Registry association + icon resource | `mahim-file.ico` |
| macOS | `Info.plist` document type + `.icns` | PNGs 16–512 px |
| Linux | freedesktop MIME + hicolor icons | `mahim-file.png` per size |
| Android | MIME intent filter | MIME type only |

Every platform follows the same rule: **the icon appears only when an
application registers the association**. The assets here give applications
everything needed for that registration.
