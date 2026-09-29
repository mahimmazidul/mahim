# MAHIM examples

| Example | Description |
|---|---|
| [`write-read.mjs`](write-read.mjs) | Write a file with metadata, payload, and compressed asset; read it back; verify integrity |
| [`inspect.mjs`](inspect.mjs) | Inspect any `.mahim` file: header, section table, integrity |
| [`browser-blob.html`](browser-blob.html) | Browser inspector using `File`/`Blob` input with selective reads |

Run the Node examples after building:

```sh
npm run build
node examples/write-read.mjs
node examples/inspect.mjs examples/write-read.mahim
```

For the browser example, serve the repository root over HTTP (module imports
require a server) and open `examples/browser-blob.html`:

```sh
npx serve .
```

See the [README](../README.md) for the full API overview and the
[specification](../spec/mahim-v1.md) for the format definition.
