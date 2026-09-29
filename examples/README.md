# MAHIM examples

| Example | Description |
|---|---|
| [`write-read.mjs`](write-read.mjs) | Write a file with metadata, payload, and compressed asset; read it back; verify integrity |
| [`inspect.mjs`](inspect.mjs) | Inspect any `.mahim` file: header, section table, integrity |
| [`browser-blob.html`](browser-blob.html) | Browser inspector using `File`/`Blob` input with selective reads |
| [`python/write_read.py`](python/write_read.py) | Python version of the write/read example |
| [`python/inspect.py`](python/inspect.py) | Python version of the inspector |
| [`python/mahim_lite.py`](python/mahim_lite.py) | Pure-stdlib Python implementation of MAHIM v1 used by both scripts |

Run the Node examples after building:

```sh
npm run build
node examples/write-read.mjs
node examples/inspect.mjs examples/write-read.mahim
```

The Python examples need only the standard library (Python 3.8 or later):

```sh
python3 examples/python/write_read.py
python3 examples/python/inspect.py examples/python/write-read.mahim
```

The Python scripts implement MAHIM v1 from the specification and
interoperate with the TypeScript implementation in both directions: each
side reads and fully verifies the other's output. As a determinism check,
the Python and Node `write-read` examples produce byte-identical files
apart from one explicit encoding field and the file digest that covers it.

For the browser example, serve the repository root over HTTP (module imports
require a server) and open `examples/browser-blob.html`:

```sh
npx serve .
```

See the [README](../README.md) for the full API overview and the
[specification](../spec/mahim-v1.md) for the format definition.
