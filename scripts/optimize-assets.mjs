// Compresses source 3D assets from assets-src/ into public/assets/.
// Run: npm run optimize-assets
//
//  - GLB: Meshopt compression + quantization (decoder is bundled with three.js).
//    Node and material names are preserved — the app looks them up by name.
//  - HDR: downsampled 2× (environment reflections only; background is a solid colour).
import { readFile, writeFile } from "node:fs/promises";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const SRC = new URL("../assets-src/", import.meta.url);
const OUT = new URL("../public/assets/", import.meta.url);

async function optimizeGlb(name, outName) {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });

  const doc = await io.read(new URL(name, SRC).pathname);
  await doc.transform(
    // Only merge geometry; materials must stay distinct (RAL_7016, Emissive…).
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH] }),
    prune({ keepLeaves: true }),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: "high" })
  );
  await io.write(new URL(outName, OUT).pathname, doc);
}

// ── Radiance .hdr (RGBE) read/downsample/write ────────────────────────────
function readHdr(buf) {
  let pos = 0;
  const line = () => {
    const end = buf.indexOf(0x0a, pos);
    const s = buf.toString("latin1", pos, end);
    pos = end + 1;
    return s;
  };
  let l;
  while ((l = line()) !== "");
  const [, h, , w] = line().split(" ").map((v, i) => (i % 2 ? +v : v));
  const rgbe = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rgbe.subarray(y * w * 4, (y + 1) * w * 4);
    if (buf[pos] === 2 && buf[pos + 1] === 2 && (buf[pos + 2] & 0x80) === 0) {
      pos += 4; // new-style RLE, channel-planar
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < w) {
          let n = buf[pos++];
          if (n > 128) {
            n -= 128;
            const v = buf[pos++];
            while (n--) row[x++ * 4 + c] = v;
          } else {
            while (n--) row[x++ * 4 + c] = buf[pos++];
          }
        }
      }
    } else {
      row.set(buf.subarray(pos, pos + w * 4));
      pos += w * 4;
    }
  }
  return { w, h, rgbe };
}

function toFloat({ w, h, rgbe }) {
  const f = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const e = rgbe[i * 4 + 3];
    const s = e ? Math.pow(2, e - 136) : 0;
    for (let c = 0; c < 3; c++) f[i * 3 + c] = rgbe[i * 4 + c] * s;
  }
  return f;
}

function writeHdr(w, h, f) {
  const header = Buffer.from(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`,
    "latin1"
  );
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const m = Math.max(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]);
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m)) + (m === 2 ** Math.ceil(Math.log2(m)) ? 1 : 0);
    const s = 256 / 2 ** e;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.floor(f[i * 3 + c] * s));
    data[i * 4 + 3] = e + 128;
  }
  return Buffer.concat([header, data]);
}

async function optimizeHdr(name, outName, factor = 2) {
  const img = readHdr(await readFile(new URL(name, SRC)));
  const src = toFloat(img);
  const w = img.w / factor, h = img.h / factor;
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let dy = 0; dy < factor; dy++)
        for (let dx = 0; dx < factor; dx++) {
          const si = ((y * factor + dy) * img.w + x * factor + dx) * 3;
          const di = (y * w + x) * 3;
          for (let c = 0; c < 3; c++) out[di + c] += src[si + c] / factor ** 2;
        }
  await writeFile(new URL(outName, OUT), writeHdr(w, h, out));
}

await optimizeGlb("Caisse3js.glb", "caisse.glb");
await optimizeHdr("studio.hdr", "studio.hdr");
console.log("Assets optimized → public/assets/");
