import { getStore } from "@netlify/blobs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plan, PlanWithHtml } from "@/lib/types";

const STORE_NAME = "vizantu-planos";
const METADATA_PREFIX = "metadata/";
const HTML_PREFIX = "plans/";
const LOCAL_ROOT = path.join(process.cwd(), ".data");
const LOCAL_METADATA = path.join(LOCAL_ROOT, "metadata");
const LOCAL_HTML = path.join(LOCAL_ROOT, "plans");

function usesNetlifyBlobs() {
  return Boolean(
    process.env.NETLIFY === "true" ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.SITE_ID ||
      (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN),
  );
}

function netlifyStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

async function ensureLocalStore() {
  await Promise.all([
    mkdir(LOCAL_METADATA, { recursive: true }),
    mkdir(LOCAL_HTML, { recursive: true }),
  ]);
}

function metadataKey(slug: string) {
  return `${METADATA_PREFIX}${slug}.json`;
}

function htmlKey(slug: string) {
  return `${HTML_PREFIX}${slug}.html`;
}

function localMetadataPath(slug: string) {
  return path.join(LOCAL_METADATA, `${slug}.json`);
}

function localHtmlPath(slug: string) {
  return path.join(LOCAL_HTML, `${slug}.html`);
}

async function listLocalPlans() {
  await ensureLocalStore();
  const files = await readdir(LOCAL_METADATA);
  const plans = await Promise.all(
    files.filter((file) => file.endsWith(".json")).map(async (file) => {
      try {
        return JSON.parse(await readFile(path.join(LOCAL_METADATA, file), "utf8")) as Plan;
      } catch {
        return null;
      }
    }),
  );
  return plans.filter((plan): plan is Plan => Boolean(plan));
}

async function listNetlifyPlans() {
  const store = netlifyStore();
  const { blobs } = await store.list({ prefix: METADATA_PREFIX });
  const plans = await Promise.all(
    blobs.map(async ({ key }) => {
      const raw = await store.get(key, { type: "text" });
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Plan;
      } catch {
        return null;
      }
    }),
  );
  return plans.filter((plan): plan is Plan => Boolean(plan));
}

export async function listPlans() {
  const plans = usesNetlifyBlobs()
    ? await listNetlifyPlans()
    : await listLocalPlans();
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPlan(slug: string): Promise<PlanWithHtml | null> {
  if (!usesNetlifyBlobs()) {
    try {
      const [metadata, html] = await Promise.all([
        readFile(localMetadataPath(slug), "utf8"),
        readFile(localHtmlPath(slug), "utf8"),
      ]);
      return { plan: JSON.parse(metadata) as Plan, html };
    } catch {
      return null;
    }
  }

  const store = netlifyStore();
  const [metadata, html] = await Promise.all([
    store.get(metadataKey(slug), { type: "text" }),
    store.get(htmlKey(slug), { type: "text" }),
  ]);
  if (!metadata || html === null) return null;

  try {
    return { plan: JSON.parse(metadata) as Plan, html };
  } catch {
    return null;
  }
}

export async function savePlan(input: {
  title: string;
  slug: string;
  originalName: string;
  html: string;
  size: number;
}) {
  const existing = await getPlan(input.slug);
  const now = new Date().toISOString();
  const plan: Plan = {
    slug: input.slug,
    title: input.title,
    originalName: input.originalName,
    size: input.size,
    createdAt: existing?.plan.createdAt || now,
    updatedAt: now,
  };

  if (!usesNetlifyBlobs()) {
    await ensureLocalStore();
    await Promise.all([
      writeFile(localHtmlPath(input.slug), input.html, "utf8"),
      writeFile(localMetadataPath(input.slug), JSON.stringify(plan), "utf8"),
    ]);
    return plan;
  }

  const store = netlifyStore();
  await Promise.all([
    store.set(htmlKey(input.slug), input.html),
    store.setJSON(metadataKey(input.slug), plan),
  ]);
  return plan;
}

export async function deletePlan(slug: string) {
  const existing = await getPlan(slug);
  if (!existing) return false;

  if (!usesNetlifyBlobs()) {
    await Promise.all([
      unlink(localHtmlPath(slug)),
      unlink(localMetadataPath(slug)),
    ]);
    return true;
  }

  const store = netlifyStore();
  await Promise.all([store.delete(htmlKey(slug)), store.delete(metadataKey(slug))]);
  return true;
}
