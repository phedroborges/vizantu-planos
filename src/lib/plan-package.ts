import "server-only";

import { build } from "esbuild";
import { unzipSync } from "fflate";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MAX_ARCHIVE_FILES = 600;
const MAX_UNCOMPRESSED_SIZE = 32 * 1024 * 1024;
const MAX_RENDERED_SIZE = 12 * 1024 * 1024;
const textExtensions = new Set([".css", ".html", ".js", ".jsx", ".json", ".mjs", ".ts", ".tsx"]);

export class PlanPackageError extends Error {}

function safePath(value: string) {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/").replace(/^\.\//, ""));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new PlanPackageError("O ZIP contém um caminho de arquivo inválido.");
  }
  return normalized;
}

function mimeType(fileName: string) {
  const extension = path.posix.extname(fileName).toLowerCase();
  return {
    ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon", ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
    ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  }[extension] || "application/octet-stream";
}

function dataUrl(fileName: string, content: Uint8Array) {
  return `data:${mimeType(fileName)};base64,${Buffer.from(content).toString("base64")}`;
}

function stripCommonDirectory(files: Record<string, Uint8Array>) {
  const entries = Object.entries(files).filter(([name]) => !name.endsWith("/"));
  const firstParts = entries.map(([name]) => safePath(name).split("/")[0]);
  const common = firstParts.length && firstParts.every((part) => part === firstParts[0]) ? `${firstParts[0]}/` : "";
  return Object.fromEntries(entries.map(([name, content]) => {
    const normalized = safePath(name);
    return [common && normalized.startsWith(common) ? normalized.slice(common.length) : normalized, content];
  }));
}

function replacePublicAssets(files: Record<string, Uint8Array>) {
  const replacements: Array<[string, string]> = [];
  for (const [fileName, content] of Object.entries(files)) {
    if (textExtensions.has(path.posix.extname(fileName).toLowerCase())) continue;
    const encoded = dataUrl(fileName, content);
    const publicName = fileName.startsWith("public/") ? fileName.slice("public/".length) : fileName;
    for (const reference of [`/${publicName}`, `./${publicName}`, publicName]) replacements.push([reference, encoded]);
  }
  replacements.sort((a, b) => b[0].length - a[0].length);

  return Object.fromEntries(Object.entries(files).map(([fileName, content]) => {
    if (!textExtensions.has(path.posix.extname(fileName).toLowerCase())) return [fileName, content];
    let source = Buffer.from(content).toString("utf8");
    for (const [reference, encoded] of replacements) source = source.split(reference).join(encoded);
    return [fileName, Buffer.from(source)];
  }));
}

async function writePackage(root: string, files: Record<string, Uint8Array>) {
  await Promise.all(Object.entries(files).map(async ([fileName, content]) => {
    const destination = path.join(root, ...fileName.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }));
}

async function bundle(entryPoint: string) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    outdir: path.join(path.dirname(entryPoint), "__vizantu_output"),
    platform: "browser",
    format: "iife",
    target: ["es2020"],
    jsx: "automatic",
    jsxImportSource: "react",
    minify: true,
    legalComments: "none",
    nodePaths: [path.join(process.cwd(), "node_modules")],
    define: { "process.env.NODE_ENV": '"production"' },
    loader: {
      ".avif": "dataurl", ".gif": "dataurl", ".jpeg": "dataurl", ".jpg": "dataurl",
      ".png": "dataurl", ".svg": "dataurl", ".webp": "dataurl", ".woff": "dataurl", ".woff2": "dataurl",
    },
    logLevel: "silent",
  });
  return {
    javascript: result.outputFiles.find((file) => file.path.endsWith(".js"))?.text || "",
    css: result.outputFiles.find((file) => file.path.endsWith(".css"))?.text || "",
  };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function titleFromPackage(files: Record<string, Uint8Array>, fallback: string) {
  for (const candidate of ["app/layout.tsx", "app/layout.jsx", "index.html"]) {
    const source = files[candidate] ? Buffer.from(files[candidate]).toString("utf8") : "";
    const metadata = source.match(/\btitle\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
    const htmlTitle = source.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (metadata || htmlTitle) return metadata || htmlTitle || fallback;
  }
  return fallback;
}

async function compileReactPackage(root: string, files: Record<string, Uint8Array>, fallbackTitle: string) {
  const pageEntry = ["app/page.tsx", "app/page.jsx", "app/page.ts", "app/page.js", "src/App.tsx", "src/App.jsx", "src/App.ts", "src/App.js"]
    .find((candidate) => files[candidate]);
  if (!pageEntry) return null;

  const cssEntry = ["app/globals.css", "src/index.css", "src/globals.css"].find((candidate) => files[candidate]);
  const wrapper = [
    'import React from "react";',
    'import { flushSync } from "react-dom";',
    'import { createRoot } from "react-dom/client";',
    `import Page from ${JSON.stringify(`./${pageEntry}`)};`,
    cssEntry ? `import ${JSON.stringify(`./${cssEntry}`)};` : "",
    'const root = createRoot(document.getElementById("root"));',
    'flushSync(() => root.render(React.createElement(Page)));',
  ].filter(Boolean).join("\n");
  const wrapperPath = path.join(root, "__vizantu_entry.tsx");
  await writeFile(wrapperPath, wrapper, "utf8");
  const output = await bundle(wrapperPath);
  const title = titleFromPackage(files, fallbackTitle);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>:root{--font-geist-sans:Arial,sans-serif;--font-geist-mono:"Courier New",monospace}${output.css}</style></head><body><div id="root"></div><script>${output.javascript}</script></body></html>`;
}

async function compileStaticPackage(root: string, files: Record<string, Uint8Array>) {
  const indexName = Object.keys(files).find((fileName) => fileName === "index.html" || fileName.endsWith("/index.html"));
  if (!indexName) return null;
  let html = Buffer.from(files[indexName]).toString("utf8");
  const directory = path.posix.dirname(indexName);
  const localPath = (reference: string) => {
    const clean = reference.split(/[?#]/)[0];
    if (!clean || /^(?:[a-z]+:|#|\/\/)/i.test(clean)) return null;
    return path.posix.normalize(clean.startsWith("/") ? clean.slice(1) : path.posix.join(directory, clean));
  };

  for (const match of [...html.matchAll(/<link\b([^>]*\brel=["']stylesheet["'][^>]*)>/gi)]) {
    const href = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
    const fileName = href ? localPath(href) : null;
    if (fileName && files[fileName]) html = html.replace(match[0], `<style>${Buffer.from(files[fileName]).toString("utf8")}</style>`);
  }
  for (const match of [...html.matchAll(/<script\b([^>]*\bsrc=["']([^"']+)["'][^>]*)>\s*<\/script>/gi)]) {
    const fileName = localPath(match[2]);
    if (!fileName || !files[fileName]) continue;
    const output = await bundle(path.join(root, ...fileName.split("/")));
    html = html.replace(match[0], `${output.css ? `<style>${output.css}</style>` : ""}<script>${output.javascript}</script>`);
  }
  return html;
}

export async function preparePlanFile(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  if (extension === ".html") {
    const html = await file.text();
    if (!/<html[\s>]|<!doctype\s+html/i.test(html)) throw new PlanPackageError("O arquivo não parece ser um documento HTML completo.");
    return { html, size: file.size, originalName: file.name };
  }
  if (extension !== ".zip") throw new PlanPackageError("Envie um arquivo HTML ou ZIP.");

  let totalSize = 0;
  let fileCount = 0;
  const unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(info) {
      fileCount += 1;
      totalSize += info.originalSize;
      if (fileCount > MAX_ARCHIVE_FILES || totalSize > MAX_UNCOMPRESSED_SIZE) {
        throw new PlanPackageError("O ZIP é grande ou complexo demais para publicação.");
      }
      return !info.name.endsWith("/") && !info.name.includes("node_modules/") && !info.name.includes(".git/");
    },
  });
  const files = replacePublicAssets(stripCommonDirectory(unpacked));
  const root = await mkdtemp(path.join(tmpdir(), "vizantu-plan-"));
  try {
    await writePackage(root, files);
    const fallbackTitle = file.name.replace(/\.zip$/i, "").replace(/[-_]+/g, " ");
    const html = await compileReactPackage(root, files, fallbackTitle) || await compileStaticPackage(root, files);
    if (!html) throw new PlanPackageError("Não encontrei `app/page.tsx`, `src/App.tsx` ou `index.html` dentro do ZIP.");
    const size = Buffer.byteLength(html);
    if (size > MAX_RENDERED_SIZE) throw new PlanPackageError("O plano compilado ultrapassou o limite de 12 MB.");
    return { html, size, originalName: file.name };
  } catch (error) {
    if (error instanceof PlanPackageError) throw error;
    console.error("Falha ao interpretar pacote ZIP", error);
    throw new PlanPackageError("Não consegui compilar este ZIP. Verifique se a apresentação possui uma página React ou um index.html válido.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
