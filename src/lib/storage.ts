import { del, list, put } from "@vercel/blob";
import type { Plan, PlanWithHtml } from "@/lib/types";

const BLOB_ROOT = "vizantu-planos";
const memory = globalThis as typeof globalThis & {
  __vizantuPlans?: Map<string, PlanWithHtml>;
};

function usesBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function memoryStore() {
  if (!memory.__vizantuPlans) memory.__vizantuPlans = new Map();
  return memory.__vizantuPlans;
}

async function listBlobPlans() {
  const { blobs } = await list({ prefix: `${BLOB_ROOT}/metadata/` });
  const plans = await Promise.all(
    blobs.map(async (blob) => {
      const response = await fetch(blob.url, { cache: "no-store" });
      if (!response.ok) return null;
      return (await response.json()) as Plan;
    }),
  );
  return plans.filter((plan): plan is Plan => Boolean(plan));
}

export async function listPlans() {
  const plans = usesBlob()
    ? await listBlobPlans()
    : [...memoryStore().values()].map(({ plan }) => plan);
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPlan(slug: string): Promise<PlanWithHtml | null> {
  if (!usesBlob()) return memoryStore().get(slug) || null;

  const { blobs } = await list({ prefix: `${BLOB_ROOT}/metadata/${slug}.json`, limit: 1 });
  const metadataBlob = blobs[0];
  if (!metadataBlob) return null;

  const metadataResponse = await fetch(metadataBlob.url, { cache: "no-store" });
  if (!metadataResponse.ok) return null;
  const plan = (await metadataResponse.json()) as Plan;
  if (!plan.htmlUrl) return null;

  const htmlResponse = await fetch(plan.htmlUrl, { cache: "no-store" });
  if (!htmlResponse.ok) return null;
  return { plan, html: await htmlResponse.text() };
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
  const base: Plan = {
    slug: input.slug,
    title: input.title,
    originalName: input.originalName,
    size: input.size,
    createdAt: existing?.plan.createdAt || now,
    updatedAt: now,
  };

  if (!usesBlob()) {
    memoryStore().set(input.slug, { plan: base, html: input.html });
    return base;
  }

  const htmlBlob = await put(`${BLOB_ROOT}/plans/${input.slug}.html`, input.html, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/html; charset=utf-8",
  });
  const metadataPath = `${BLOB_ROOT}/metadata/${input.slug}.json`;
  const plan: Plan = { ...base, htmlUrl: htmlBlob.url };
  const metadataBlob = await put(metadataPath, JSON.stringify(plan), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
  plan.metadataUrl = metadataBlob.url;
  await put(metadataPath, JSON.stringify(plan), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
  return plan;
}

export async function deletePlan(slug: string) {
  const existing = await getPlan(slug);
  if (!existing) return false;

  if (!usesBlob()) return memoryStore().delete(slug);

  const urls = [existing.plan.htmlUrl, existing.plan.metadataUrl].filter((url): url is string => Boolean(url));
  if (urls.length) await del(urls);
  return true;
}
