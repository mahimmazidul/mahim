import { mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "file-icons", "mahim-file.svg");
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const icoSizes = [16, 32, 48, 64, 128, 256];

function run(args) {
  const result = spawnSync("magick", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`magick failed: ${args.join(" ")}`);
  }
}

if (!existsSync(source)) {
  throw new Error(`missing canonical icon: ${source}`);
}

for (const size of sizes) {
  const dir = join(root, "assets", "file-icons", "png", String(size));
  mkdirSync(dir, { recursive: true });
  run([
    "-background",
    "none",
    "-density",
    "768",
    source,
    "-resize",
    `${size}x${size}`,
    join(dir, "mahim-file.png"),
  ]);
}

const icoInputs = icoSizes.map((size) =>
  join(root, "assets", "file-icons", "png", String(size), "mahim-file.png"),
);
run([...icoInputs, join(root, "assets", "file-icons", "mahim-file.ico")]);
console.log(`generated ${sizes.length} PNG sizes and mahim-file.ico`);
