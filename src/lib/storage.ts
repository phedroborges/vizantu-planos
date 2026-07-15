import { getStore } from "@netlify/blobs";
import type { Plan, PlanWithHtml } from "@/lib/types";

const STORE_NAME = "vizantu-planos";
const METADATA_PREFIX = "metadata/";
const HTML_PREFIX = "plans/";
const memory = globalThis as typeof globalThis & {
  __vizantuPlans?: Map<string, PlanWithHtml>;
};

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

function memoryStore() {
  if (!memory.__vizantuPlans) memory.__vizantuPlans = new Map();
  return memory.__vizantuPlans;
}

function metadataKey(slug: string) {
  return `${METADATA_PREFIX}${slug}.json`;
}

function htmlKey(slug: string) {
  return `${HTML_PREFIX}${slug}.html`;
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
    : [...memoryStore().values()].map(({ plan }) => plan);
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPlan(slug: string): Promise<PlanWithHtml | null> {
  if (!usesNetlifyBlobs()) return memoryStore().get(slug) || null;

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
    memoryStore().set(input.slug, { plan, html: input.html });
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

  if (!usesNetlifyBlobs()) return memoryStore().delete(slug);

  const store = netlifyStore();
  await Promise.all([store.delete(htmlKey(slug)), store.delete(metadataKey(slug))]);
  return true;
}
