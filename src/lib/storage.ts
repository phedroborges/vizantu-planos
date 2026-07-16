import { getStore } from "@netlify/blobs";
import { del as delVercelBlobs, list as listVercelBlobs, put as putVercelBlob } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApprovalEvent, ApprovalItem, ApprovalStatus, ApprovalSummary, Plan, PlanApprovals, PlanWithHtml } from "@/lib/types";

const STORE_NAME = "vizantu-planos";
const VERCEL_ROOT = "vizantu-planos";
const METADATA_PREFIX = "metadata/";
const HTML_PREFIX = "plans/";
const APPROVALS_PREFIX = "approvals/";
const LOCAL_ROOT = path.join(process.cwd(), ".data");
const LOCAL_METADATA = path.join(LOCAL_ROOT, "metadata");
const LOCAL_HTML = path.join(LOCAL_ROOT, "plans");
const LOCAL_APPROVALS = path.join(LOCAL_ROOT, "approvals");

function usesVercelBlobs() {
  if (process.env.STORAGE_DRIVER === "local") return false;
  return Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

function usesNetlifyBlobs() {
  if (process.env.STORAGE_DRIVER === "local") return false;
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
    mkdir(LOCAL_APPROVALS, { recursive: true }),
  ]);
}

function metadataKey(slug: string) {
  return `${METADATA_PREFIX}${slug}.json`;
}

function htmlKey(slug: string) {
  return `${HTML_PREFIX}${slug}.html`;
}

function approvalsKey(slug: string) {
  return `${APPROVALS_PREFIX}${slug}.json`;
}

function localMetadataPath(slug: string) {
  return path.join(LOCAL_METADATA, `${slug}.json`);
}

function localHtmlPath(slug: string) {
  return path.join(LOCAL_HTML, `${slug}.html`);
}

function localApprovalsPath(slug: string) {
  return path.join(LOCAL_APPROVALS, `${slug}.json`);
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

async function listVercelPlans() {
  const { blobs } = await listVercelBlobs({ prefix: `${VERCEL_ROOT}/${METADATA_PREFIX}` });
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
  const plans = usesVercelBlobs()
    ? await listVercelPlans()
    : usesNetlifyBlobs()
      ? await listNetlifyPlans()
      : await listLocalPlans();
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function emptyApprovals(slug: string): PlanApprovals {
  return { planSlug: slug, items: [], history: [] };
}

export function summarizeApprovals(approvals: PlanApprovals): ApprovalSummary {
  const total = approvals.items.length;
  const approved = approvals.items.filter((item) => item.status === "approved").length;
  const changesRequested = approvals.items.filter((item) => item.status === "changes_requested").length;
  const pending = total - approved - changesRequested;
  let status: ApprovalSummary["status"] = "not_started";

  if (total > 0) status = "pending";
  if (approved > 0) status = "in_review";
  if (changesRequested > 0) status = "changes_requested";
  if (total > 0 && approved === total) status = "approved";

  return { total, approved, changesRequested, pending, status, updatedAt: approvals.updatedAt };
}

export async function getPlanApprovals(slug: string): Promise<PlanApprovals> {
  if (usesVercelBlobs()) {
    const { blobs } = await listVercelBlobs({
      prefix: `${VERCEL_ROOT}/${approvalsKey(slug)}`,
      limit: 1,
    });
    if (!blobs[0]) return emptyApprovals(slug);
    const response = await fetch(blobs[0].url, { cache: "no-store" });
    if (!response.ok) return emptyApprovals(slug);
    return (await response.json()) as PlanApprovals;
  }

  if (!usesNetlifyBlobs()) {
    try {
      return JSON.parse(await readFile(localApprovalsPath(slug), "utf8")) as PlanApprovals;
    } catch {
      return emptyApprovals(slug);
    }
  }

  const raw = await netlifyStore().get(approvalsKey(slug), { type: "text" });
  if (!raw) return emptyApprovals(slug);
  try {
    return JSON.parse(raw) as PlanApprovals;
  } catch {
    return emptyApprovals(slug);
  }
}

async function writePlanApprovals(approvals: PlanApprovals) {
  if (usesVercelBlobs()) {
    await putVercelBlob(`${VERCEL_ROOT}/${approvalsKey(approvals.planSlug)}`, JSON.stringify(approvals), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    return approvals;
  }

  if (!usesNetlifyBlobs()) {
    await ensureLocalStore();
    await writeFile(localApprovalsPath(approvals.planSlug), JSON.stringify(approvals), "utf8");
    return approvals;
  }

  await netlifyStore().setJSON(approvalsKey(approvals.planSlug), approvals);
  return approvals;
}

export async function listApprovalSummaries(slugs: string[]) {
  const entries = await Promise.all(
    slugs.map(async (slug) => [slug, summarizeApprovals(await getPlanApprovals(slug))] as const),
  );
  return Object.fromEntries(entries) as Record<string, ApprovalSummary>;
}

export async function syncApprovalItems(slug: string, items: Array<Pick<ApprovalItem, "id" | "title">>) {
  const approvals = await getPlanApprovals(slug);
  const current = new Map(approvals.items.map((item) => [item.id, item]));
  const syncedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    status: current.get(item.id)?.status || "pending" as ApprovalStatus,
    comment: current.get(item.id)?.comment || "",
    updatedAt: current.get(item.id)?.updatedAt,
  }));
  const changed = JSON.stringify(syncedItems) !== JSON.stringify(approvals.items);
  if (!changed) return approvals;
  return writePlanApprovals({ ...approvals, items: syncedItems, updatedAt: new Date().toISOString() });
}

export async function recordApproval(input: {
  slug: string;
  itemId: string;
  itemTitle: string;
  status: ApprovalStatus;
  comment: string;
}) {
  const approvals = await getPlanApprovals(input.slug);
  const now = new Date().toISOString();
  const index = approvals.items.findIndex((item) => item.id === input.itemId);
  const current = index >= 0
    ? approvals.items[index]
    : { id: input.itemId, title: input.itemTitle, status: "pending" as ApprovalStatus, comment: "" };
  const comment = input.comment.trim();

  if (current.status === input.status && current.comment === comment && current.title === input.itemTitle) {
    return approvals;
  }

  const nextItem: ApprovalItem = {
    id: input.itemId,
    title: input.itemTitle,
    status: input.status,
    comment,
    updatedAt: now,
  };
  const items = [...approvals.items];
  if (index >= 0) items[index] = nextItem;
  else items.push(nextItem);

  const action: ApprovalEvent["action"] = current.status !== input.status
    ? input.status === "approved"
      ? "approved"
      : input.status === "changes_requested"
        ? "changes_requested"
        : "reopened"
    : "commented";

  const history = [...approvals.history, {
    id: randomUUID(),
    itemId: input.itemId,
    itemTitle: input.itemTitle,
    action,
    status: input.status,
    previousStatus: current.status,
    comment,
    createdAt: now,
  }];

  return writePlanApprovals({ planSlug: input.slug, items, history, updatedAt: now });
}

export async function getPlan(slug: string): Promise<PlanWithHtml | null> {
  if (usesVercelBlobs()) {
    const { blobs } = await listVercelBlobs({
      prefix: `${VERCEL_ROOT}/${metadataKey(slug)}`,
      limit: 1,
    });
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

  if (usesVercelBlobs()) {
    const htmlBlob = await putVercelBlob(`${VERCEL_ROOT}/${htmlKey(input.slug)}`, input.html, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/html; charset=utf-8",
    });
    const metadataPath = `${VERCEL_ROOT}/${metadataKey(input.slug)}`;
    const vercelPlan: Plan = { ...plan, htmlUrl: htmlBlob.url };
    const metadataBlob = await putVercelBlob(metadataPath, JSON.stringify(vercelPlan), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    vercelPlan.metadataUrl = metadataBlob.url;
    await putVercelBlob(metadataPath, JSON.stringify(vercelPlan), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    return vercelPlan;
  }

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

  if (usesVercelBlobs()) {
    const { blobs: approvalBlobs } = await listVercelBlobs({
      prefix: `${VERCEL_ROOT}/${approvalsKey(slug)}`,
      limit: 1,
    });
    const urls = [existing.plan.htmlUrl, existing.plan.metadataUrl, approvalBlobs[0]?.url].filter(
      (url): url is string => Boolean(url),
    );
    if (urls.length) await delVercelBlobs(urls);
    return true;
  }

  if (!usesNetlifyBlobs()) {
    await Promise.all([
      unlink(localHtmlPath(slug)),
      unlink(localMetadataPath(slug)),
      unlink(localApprovalsPath(slug)).catch(() => undefined),
    ]);
    return true;
  }

  const store = netlifyStore();
  await Promise.all([
    store.delete(htmlKey(slug)),
    store.delete(metadataKey(slug)),
    store.delete(approvalsKey(slug)),
  ]);
  return true;
}
