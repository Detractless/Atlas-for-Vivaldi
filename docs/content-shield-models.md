# Content shield model files

The content shield (`atlas-nsfw-*.js` page scripts) runs two image models in the browser. The model files and the
libraries that run them live in `payload/install-files/components/atlas/nsfw/` (28 files, about 265 MB). They are **not in
git**: one file, `models/freepik-eva02-448-fp16.onnx` (165 MB), is over GitHub's 100 MB limit for a file in a repository,
and the folder is kept out of every commit on purpose (`.gitignore`). They are stored as a release download instead.

## Get them on a fresh copy

1. Download `atlas-content-shield-models.zip` (193 MB) from the
   [content-shield-models-1 release](https://github.com/Detractless/Atlas-for-Vivaldi/releases/tag/content-shield-models-1).
   The repository is private, so sign in as an account that can see it.
2. Check the download: `shasum -a 256 atlas-content-shield-models.zip` must print
   `c5e2cc3334dcf4d117ed4f156ba9412dddbf99a09411e6304df43060b828c896`.
3. Unzip it into `payload/install-files/components/atlas/`. The zip holds one folder, `nsfw/`, so you end up with
   `payload/install-files/components/atlas/nsfw/models/...`.
4. Run the installer as usual. It copies the folder with the rest of the page scripts.

Or from a terminal, in the repository folder:

```
gh release download content-shield-models-1 -p atlas-content-shield-models.zip -D /tmp/atlas-models
unzip /tmp/atlas-models/atlas-content-shield-models.zip -d payload/install-files/components/atlas/
```

## What is inside

| Part | What it is |
| --- | --- |
| `models/freepik-eva02-448-fp16.onnx` | The larger image model (165 MB). |
| `models/marqo-384-fp32.onnx`, `models/marqo/` | The second image model, in ONNX and TensorFlow.js form. |
| `models/group1-shard*`, `models/model.json` | The TensorFlow.js model's weights and layout. |
| `ort.min.js`, `ort-wasm-*`, `tf.min.js`, `tfjs-backend-*` | The ONNX Runtime and TensorFlow.js libraries that run them. |
| `offscreen*.js`, `offscreen.html`, `regenerator-shim.js` | The page that loads the models off screen. |

## Not checked yet

The licences of the two models and the two libraries have not been checked. The repository is private, so the release is
only a backup. Before the repository goes public, check each licence and decide whether the files may be shared at all;
if not, publish a note on where to fetch them instead.

## Changing them

If the folder changes, zip it again (`zip -r -X nsfw.zip nsfw -x '*.DS_Store'` from `components/atlas/`), publish a new
release with a new tag (`content-shield-models-2`), and update the tag, size and checksum here and in the README.
