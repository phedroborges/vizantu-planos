import { getStore } from "@netlify/blobs";
import {
  BlobPreconditionFailedError,
  del as delVercelBlobs,
  get as getVercelBlob,
  list as listVercelBlobs,
  put as putVercelBlob,
} from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApprovalEvent, ApprovalItem, ApprovalStatus, ApprovalSummary, Plan, PlanApprovals, PlanKind, PlanWithHtml } from "@/lib/types";

const STORE_NAME = "vizantu-planos";
const VERCEL_ROOT = "vizantu-planos";
const METADATA_PREFIX = "metadata/";
const HTML_PREFIX = "plans/";
const APPROVALS_PREFIX = "approvals/";
const APPROVAL_EVENTS_PREFIX = "approval-events/";
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

function approvalEventPrefix(slug: string) {
  return `${VERCEL_ROOT}/${APPROVAL_EVENTS_PREFIX}${slug}/`;
}

function approvalEventKey(slug: string, eventId: string) {
  return `${approvalEventPrefix(slug)}${eventId}.json`;
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
      const result = await getVercelBlob(blob.pathname, { access: "public", useCache: false });
      if (!result || result.statusCode !== 200) return null;
      return JSON.parse(await new Response(result.stream).text()) as Plan;
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

type ApprovalSnapshot = {
  approvals: PlanApprovals;
  etag?: string;
  needsCompaction?: boolean;
};

type ApprovalMutation = (approvals: PlanApprovals) => PlanApprovals | null;

const approvalMutationQueues = new Map<string, Promise<void>>();

async function withApprovalMutationQueue<T>(slug: string, operation: () => Promise<T>) {
  const previous = approvalMutationQueues.get(slug) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  approvalMutationQueues.set(slug, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (approvalMutationQueues.get(slug) === queued) approvalMutationQueues.delete(slug);
  }
}

async function listVercelApprovalEvents(slug: string) {
  const blobs = [];
  let cursor: string | undefined;

  do {
    const result = await listVercelBlobs({ prefix: approvalEventPrefix(slug), cursor, limit: 1000 });
    blobs.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return blobs;
}

function mergeApprovalEvents(approvals: PlanApprovals, events: ApprovalEvent[]) {
  if (!events.length) return approvals;

  const knownHistory = new Set(approvals.history.map((event) => event.id));
  const history = [...approvals.history];
  const eventIds = new Set(approvals.eventIds || []);

  for (const event of events) {
    eventIds.add(event.id);
    if (!knownHistory.has(event.id)) {
      knownHistory.add(event.id);
      history.push(event);
    }
  }

  history.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const items = approvals.items.map((item) => ({ ...item }));
  const itemIndexes = new Map(items.map((item, index) => [item.id, index]));

  for (const event of history) {
    const index = itemIndexes.get(event.itemId);
    const item: ApprovalItem = {
      id: event.itemId,
      title: event.itemTitle,
      status: event.status,
      comment: event.comment,
      updatedAt: event.createdAt,
    };
    if (index === undefined) {
      itemIndexes.set(event.itemId, items.length);
      items.push(item);
    } else {
      items[index] = item;
    }
  }

  const updatedAt = history.at(-1)?.createdAt || approvals.updatedAt;
  return { ...approvals, items, history, eventIds: [...eventIds], updatedAt };
}

async function getVercelApprovalSnapshot(slug: string): Promise<ApprovalSnapshot> {
  const result = await getVercelBlob(`${VERCEL_ROOT}/${approvalsKey(slug)}`, { access: "public", useCache: false });
  const stored = !result || result.statusCode !== 200
    ? emptyApprovals(slug)
    : JSON.parse(await new Response(result.stream).text()) as PlanApprovals;
  const knownEvents = new Set(stored.eventIds || []);
  const eventBlobs = await listVercelApprovalEvents(slug);
  const missingBlobs = eventBlobs.filter((blob) => {
    const eventId = blob.pathname.slice(approvalEventPrefix(slug).length, -".json".length);
    return !knownEvents.has(eventId);
  });
  const events = await Promise.all(missingBlobs.map(async (blob) => {
    const eventResult = await getVercelBlob(blob.pathname, { access: "public", useCache: false });
    if (!eventResult || eventResult.statusCode !== 200) return null;
    return JSON.parse(await new Response(eventResult.stream).text()) as ApprovalEvent;
  }));

  return {
    approvals: mergeApprovalEvents(stored, events.filter((event): event is ApprovalEvent => Boolean(event))),
    etag: result?.statusCode === 200 ? result.blob.etag : undefined,
    needsCompaction: missingBlobs.length > 0,
  };
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
    const snapshot = await getVercelApprovalSnapshot(slug);
    if (snapshot.needsCompaction) {
      writePlanApprovals(snapshot.approvals, { ifMatch: snapshot.etag }).catch(() => undefined);
    }
    return snapshot.approvals;
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

async function writePlanApprovals(approvals: PlanApprovals, options: { ifMatch?: string } = {}) {
  if (usesVercelBlobs()) {
    await putVercelBlob(`${VERCEL_ROOT}/${approvalsKey(approvals.planSlug)}`, JSON.stringify(approvals), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
      ifMatch: options.ifMatch,
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

function isApprovalWriteConflict(error: unknown) {
  if (error instanceof BlobPreconditionFailedError) return true;
  if (!(error instanceof Error)) return false;
  return /precondition|conditional request|conflicting operation/i.test(error.message);
}

async function mutatePlanApprovals(slug: string, mutation: ApprovalMutation) {
  if (usesVercelBlobs()) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const snapshot = await getVercelApprovalSnapshot(slug);
      const next = mutation(snapshot.approvals);
      if (!next) return snapshot.approvals;

      try {
        return await writePlanApprovals(next, { ifMatch: snapshot.etag });
      } catch (error) {
        if (!isApprovalWriteConflict(error)) throw error;
        const backoff = Math.min(750, 60 + attempt * 45) + Math.floor(Math.random() * 180);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw new Error("As aprovações mudaram ao mesmo tempo muitas vezes. Tente novamente.");
  }

  return withApprovalMutationQueue(slug, async () => {
    const approvals = await getPlanApprovals(slug);
    const next = mutation(approvals);
    return next ? writePlanApprovals(next) : approvals;
  });
}

async function writeVercelApprovalEvent(slug: string, event: ApprovalEvent) {
  await putVercelBlob(approvalEventKey(slug, event.id), JSON.stringify(event), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json; charset=utf-8",
  });
}

export async function listApprovalSummaries(slugs: string[]) {
  const entries = await Promise.all(
    slugs.map(async (slug) => [slug, summarizeApprovals(await getPlanApprovals(slug))] as const),
  );
  return Object.fromEntries(entries) as Record<string, ApprovalSummary>;
}

export async function syncApprovalItems(slug: string, items: Array<Pick<ApprovalItem, "id" | "title">>) {
  return mutatePlanApprovals(slug, (approvals) => {
    const current = new Map(approvals.items.map((item) => [item.id, item]));
    const syncedItems = items.map((item) => ({
      id: item.id,
      title: item.title,
      status: current.get(item.id)?.status || "pending" as ApprovalStatus,
      comment: current.get(item.id)?.comment || "",
      updatedAt: current.get(item.id)?.updatedAt,
    }));
    const changed = JSON.stringify(syncedItems) !== JSON.stringify(approvals.items);
    return changed ? { ...approvals, items: syncedItems, updatedAt: new Date().toISOString() } : null;
  });
}

export async function recordApproval(input: {
  slug: string;
  itemId: string;
  itemTitle: string;
  status: ApprovalStatus;
  comment: string;
}) {
  const applyChange = (approvals: PlanApprovals) => {
    const now = new Date().toISOString();
    const index = approvals.items.findIndex((item) => item.id === input.itemId);
    const current = index >= 0
      ? approvals.items[index]
      : { id: input.itemId, title: input.itemTitle, status: "pending" as ApprovalStatus, comment: "" };
    const comment = input.comment.trim();

    if (current.status === input.status && current.comment === comment && current.title === input.itemTitle) {
      return null;
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

    const event: ApprovalEvent = {
      id: randomUUID(),
      itemId: input.itemId,
      itemTitle: input.itemTitle,
      action,
      status: input.status,
      previousStatus: current.status,
      comment,
      createdAt: now,
    };
    const history = [...approvals.history, event];

    return {
      approvals: { ...approvals, planSlug: input.slug, items, history, updatedAt: now },
      event,
    };
  };

  if (usesVercelBlobs()) {
    const snapshot = await getVercelApprovalSnapshot(input.slug);
    const changed = applyChange(snapshot.approvals);
    if (!changed) return snapshot.approvals;

    changed.approvals.eventIds = [...new Set([...(changed.approvals.eventIds || []), changed.event.id])];
    await writeVercelApprovalEvent(input.slug, changed.event);
    writePlanApprovals(changed.approvals, { ifMatch: snapshot.etag }).catch(() => undefined);
    return changed.approvals;
  }

  return mutatePlanApprovals(input.slug, (approvals) => applyChange(approvals)?.approvals || null);
}

export async function getPlan(slug: string): Promise<PlanWithHtml | null> {
  if (usesVercelBlobs()) {
    const metadataResult = await getVercelBlob(`${VERCEL_ROOT}/${metadataKey(slug)}`, { access: "public", useCache: false });
    if (!metadataResult || metadataResult.statusCode !== 200) return null;
    const plan = JSON.parse(await new Response(metadataResult.stream).text()) as Plan;
    const htmlResult = await getVercelBlob(`${VERCEL_ROOT}/${htmlKey(slug)}`, { access: "public", useCache: false });
    if (!htmlResult || htmlResult.statusCode !== 200) return null;
    return { plan, html: await new Response(htmlResult.stream).text() };
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
  kind?: PlanKind;
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
    kind: input.kind || existing?.plan.kind || "approval",
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

export async function setPlanKind(slug: string, kind: PlanKind): Promise<Plan | null> {
  if (usesVercelBlobs()) {
    const metadataPath = `${VERCEL_ROOT}/${metadataKey(slug)}`;
    const result = await getVercelBlob(metadataPath, { access: "public", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const plan = { ...JSON.parse(await new Response(result.stream).text()) as Plan, kind, updatedAt: new Date().toISOString() };
    await putVercelBlob(metadataPath, JSON.stringify(plan), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    return plan;
  }

  if (!usesNetlifyBlobs()) {
    try {
      const plan = { ...JSON.parse(await readFile(localMetadataPath(slug), "utf8")) as Plan, kind, updatedAt: new Date().toISOString() };
      await writeFile(localMetadataPath(slug), JSON.stringify(plan), "utf8");
      return plan;
    } catch {
      return null;
    }
  }

  const store = netlifyStore();
  const raw = await store.get(metadataKey(slug), { type: "text" });
  if (!raw) return null;
  const plan = { ...JSON.parse(raw) as Plan, kind, updatedAt: new Date().toISOString() };
  await store.setJSON(metadataKey(slug), plan);
  return plan;
}

export async function deletePlan(slug: string) {
  if (usesVercelBlobs()) {
    const eventBlobs = await listVercelApprovalEvents(slug);
    await delVercelBlobs([
      `${VERCEL_ROOT}/${htmlKey(slug)}`,
      `${VERCEL_ROOT}/${metadataKey(slug)}`,
      `${VERCEL_ROOT}/${approvalsKey(slug)}`,
      ...eventBlobs.map((blob) => blob.pathname),
    ]);
    return true;
  }

  const existing = await getPlan(slug);
  if (!existing) return false;

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
