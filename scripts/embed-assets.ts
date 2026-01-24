import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, relative } from "path";

const distPath = join(process.cwd(), "apps/web/dist");
const outputDir = join(process.cwd(), "output-gitignore");
const outputPath = join(outputDir, "embedded-assets.ts");

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

if (!existsSync(distPath)) {
  console.error("Web dist folder not found. Please run build:web first.");
  process.exit(1);
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  const list = readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const res = join(dir, file.name);
    if (file.isDirectory()) {
      results.push(...getAllFiles(res));
    } else {
      results.push(res);
    }
  }
  return results;
}

const files = getAllFiles(distPath);
const assets: Record<string, { content: string; contentType: string }> = {};

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

for (const file of files) {
  const relPath = "/" + relative(distPath, file);
  const ext = "." + file.split(".").pop();
  const content = readFileSync(file);
  assets[relPath] = {
    content: content.toString("base64"),
    contentType: contentTypes[ext] || "application/octet-stream",
  };
}

const tsContent = `// This file is auto-generated. Do not edit.
export const embeddedAssets: Record<string, { content: string; contentType: string }> = ${JSON.stringify(assets, null, 2)};
`;

writeFileSync(outputPath, tsContent);
console.log(`Embedded ${Object.keys(assets).length} assets into ${outputPath}`);
