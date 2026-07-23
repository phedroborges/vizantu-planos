import { getStore } from "@netlify/blobs";
import {
  BlobPreconditionFailedError,
  del as delVercelBlobs,
  get as getVercelBlob,
  list as listVercelBlobs,
  put as putVercelBlob,
} from "@vercel/blob";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { approvalDeadlineFromDays, isPlanExpired } from "@/lib/approval-deadline";
import type { ApprovalEvent, ApprovalItem, ApprovalResponse, ApprovalStatus, ApprovalSummary, Plan, PlanApprovals, PlanKind, PlanWithHtml } from "@/lib/types";

const STORE_NAME = "vizantu-planos";
const VERCEL_ROOT = "vizantu-planos";
const METADATA_PREFIX = "metadata/";
const HTML_PREFIX = "plans/";
const APPROVALS_PREFIX = "approvals/";
const APPROVAL_EVENTS_PREFIX = "approval-events/";
const LOCAL_ROOT = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), ".data");
const LOCAL_METADATA = path.join(LOCAL_ROOT, "metadata");
const LOCAL_HTML = path.join(LOCAL_ROOT, "plans");
const LOCAL_APPROVALS = path.join(LOCAL_ROOT, "approvals");
const LOCAL_BACKUPS = path.join(LOCAL_ROOT, "backups");

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
      const result = await readVercelText(blob.pathname);
      if (!result) return null;
      return JSON.parse(result.text) as Plan;
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

function legacyReviewerId(name?: string) {
  const normalized = name?.trim().toLocaleLowerCase("pt-BR") || "visitante";
  return `legacy-${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
}

function aggregateApprovalItem(item: ApprovalItem, responses: ApprovalResponse[]) {
  const active = responses.filter((response) => response.status !== "pending");
  const approved = active.filter((response) => response.status === "approved");
  const adjustments = active.filter((response) => response.status === "changes_requested");
  const status: ApprovalStatus = approved.length ? "approved" : adjustments.length ? "changes_requested" : "pending";
  const representative = [...(status === "approved" ? approved : status === "changes_requested" ? adjustments : responses)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const updatedAt = [...responses].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt || item.updatedAt;

  return {
    ...item,
    status,
    comment: representative?.comment || "",
    approverName: representative?.approverName,
    updatedAt,
    responses,
  } satisfies ApprovalItem;
}

function normalizeApprovalItem(item: ApprovalItem) {
  let responses = item.responses?.filter((response) => response.reviewerId && response.approverName) || [];
  if (!responses.length && item.status !== "pending" && item.updatedAt) {
    responses = [{
      reviewerId: legacyReviewerId(item.approverName),
      approverName: item.approverName || "Cliente",
      status: item.status,
      comment: item.comment || "",
      updatedAt: item.updatedAt,
    }];
  }
  return aggregateApprovalItem(item, responses);
}

function normalizeApprovals(approvals: PlanApprovals) {
  return { ...approvals, items: approvals.items.map(normalizeApprovalItem) };
}

async function readVercelText(pathname: string) {
  try {
    const result = await getVercelBlob(pathname, { access: "public", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return {
      text: await new Response(result.stream).text(),
      etag: result.blob.etag,
    };
  } catch (error) {
    if (!(error instanceof Error) || !/403|forbidden/i.test(error.message)) throw error;
  }

  const { blobs } = await listVercelBlobs({ prefix: pathname, limit: 100 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) return null;

  const response = await fetch(blob.downloadUrl, {
    cache: "no-store",
    headers: { Accept: "application/octet-stream" },
  });
  if (!response.ok) throw new Error(`Vercel Blob: leitura pública falhou com status ${response.status}.`);
  return { text: await response.text(), etag: blob.etag };
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
  const normalized = normalizeApprovals(approvals);
  if (!events.length) return normalized;

  const knownHistory = new Set(normalized.history.map((event) => event.id));
  const history = [...normalized.history];
  const eventIds = new Set(normalized.eventIds || []);

  for (const event of events) {
    eventIds.add(event.id);
    if (!knownHistory.has(event.id)) {
      knownHistory.add(event.id);
      history.push(event);
    }
  }

  history.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const items: ApprovalItem[] = normalized.items.map((item) => ({ ...item, responses: [...(item.responses || [])] }));
  const itemIndexes = new Map(items.map((item, index) => [item.id, index]));

  for (const event of history) {
    let index = itemIndexes.get(event.itemId);
    if (index === undefined) {
      index = items.length;
      itemIndexes.set(event.itemId, index);
      items.push({ id: event.itemId, title: event.itemTitle, status: "pending", comment: "", responses: [] });
    }
    const current = items[index];
    const reviewerId = event.reviewerId || legacyReviewerId(event.approverName);
    const response: ApprovalResponse = {
      reviewerId,
      approverName: event.approverName || "Cliente",
      status: event.status,
      comment: event.comment,
      updatedAt: event.createdAt,
      reviewVersion: event.reviewVersion,
    };
    const responses = [...(current.responses || [])];
    const responseIndex = responses.findIndex((entry) => entry.reviewerId === reviewerId);
    if (responseIndex >= 0) responses[responseIndex] = response;
    else responses.push(response);
    items[index] = aggregateApprovalItem({ ...current, title: event.itemTitle }, responses);
  }

  const updatedAt = history.at(-1)?.createdAt || normalized.updatedAt;
  return { ...normalized, items, history, eventIds: [...eventIds], updatedAt };
}

async function getVercelApprovalSnapshot(slug: string): Promise<ApprovalSnapshot> {
  const result = await readVercelText(`${VERCEL_ROOT}/${approvalsKey(slug)}`);
  const stored = !result
    ? emptyApprovals(slug)
    : JSON.parse(result.text) as PlanApprovals;
  const knownEvents = new Set(stored.eventIds || []);
  const eventBlobs = await listVercelApprovalEvents(slug);
  const missingBlobs = eventBlobs.filter((blob) => {
    const eventId = blob.pathname.slice(approvalEventPrefix(slug).length, -".json".length);
    return !knownEvents.has(eventId);
  });
  const events = await Promise.all(missingBlobs.map(async (blob) => {
    const eventResult = await readVercelText(blob.pathname);
    if (!eventResult) return null;
    return JSON.parse(eventResult.text) as ApprovalEvent;
  }));

  return {
    approvals: mergeApprovalEvents(stored, events.filter((event): event is ApprovalEvent => Boolean(event))),
    etag: result?.etag,
    needsCompaction: missingBlobs.length > 0,
  };
}

export function summarizeApprovals(approvals: PlanApprovals): ApprovalSummary {
  const total = approvals.items.length;
  const approved = approvals.autoApproved ? total : approvals.items.filter((item) => item.status === "approved").length;
  const changesRequested = approvals.autoApproved ? 0 : approvals.items.filter((item) => item.status === "changes_requested").length;
  const pending = total - approved - changesRequested;
  const roundComplete = total > 0 && pending === 0;
  let status: ApprovalSummary["status"] = "not_started";

  if (approvals.autoApproved) status = "approved";
  if (total > 0) status = "pending";
  if (approved > 0) status = "in_review";
  if (changesRequested > 0) status = "changes_requested";
  if (total > 0 && approved === total) status = "approved";

  if (approvals.autoApproved) status = "approved";
  return {
    total,
    approved,
    changesRequested,
    pending,
    status,
    updatedAt: approvals.updatedAt,
    autoApproved: approvals.autoApproved,
    deadlineAt: approvals.deadlineAt,
    roundComplete,
    reviewVersion: approvals.reviewVersion,
  };
}

export function isApprovalRoundComplete(approvals: PlanApprovals) {
  return approvals.items.length > 0 && approvals.items.every((item) => item.status !== "pending");
}

export function applyPlanDeadline(plan: Plan, approvals: PlanApprovals, now = new Date()): PlanApprovals {
  const reviewVersion = plan.reviewVersion || approvals.reviewVersion || 1;
  if (isApprovalRoundComplete(approvals) || !isPlanExpired(plan, now)) {
    return { ...approvals, autoApproved: false, deadlineAt: plan.approvalDeadline, reviewVersion };
  }
  return {
    ...approvals,
    items: approvals.items.map((item) => ({ ...item, status: "approved" as ApprovalStatus })),
    autoApproved: true,
    deadlineAt: plan.approvalDeadline,
    reviewVersion,
  };
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
      return normalizeApprovals(JSON.parse(await readFile(localApprovalsPath(slug), "utf8")) as PlanApprovals);
    } catch {
      return emptyApprovals(slug);
    }
  }

  const raw = await netlifyStore().get(approvalsKey(slug), { type: "text" });
  if (!raw) return emptyApprovals(slug);
  try {
    return normalizeApprovals(JSON.parse(raw) as PlanApprovals);
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

export async function listApprovalSummaries(plans: Plan[]) {
  const entries = await Promise.all(
    plans.map(async (plan) => [plan.slug, summarizeApprovals(applyPlanDeadline(plan, await getPlanApprovals(plan.slug)))] as const),
  );
  return Object.fromEntries(entries) as Record<string, ApprovalSummary>;
}

export async function recordPlanView(input: {
  slug: string;
  reviewerId: string;
  name: string;
}) {
  return mutatePlanApprovals(input.slug, (approvals) => {
    const name = input.name.trim();
    if (!name || name === "Vizantu") return null;
    const now = new Date().toISOString();
    const viewers = [...(approvals.viewers || [])];
    const index = viewers.findIndex((viewer) => viewer.reviewerId === input.reviewerId);

    if (index >= 0) {
      viewers[index] = {
        ...viewers[index],
        name,
        lastViewedAt: now,
        viewCount: viewers[index].viewCount + 1,
      };
    } else {
      viewers.push({
        reviewerId: input.reviewerId,
        name,
        firstViewedAt: now,
        lastViewedAt: now,
        viewCount: 1,
      });
    }

    return { ...approvals, viewers, updatedAt: now };
  });
}

export async function syncApprovalItems(slug: string, items: Array<Pick<ApprovalItem, "id" | "title">>) {
  return mutatePlanApprovals(slug, (approvals) => {
    const current = new Map(normalizeApprovals(approvals).items.map((item) => [item.id, item]));
    const syncedItems = items.map((item) => {
      const stored = current.get(item.id);
      return stored
        ? aggregateApprovalItem({ ...stored, title: item.title }, stored.responses || [])
        : { id: item.id, title: item.title, status: "pending" as ApprovalStatus, comment: "", responses: [] };
    });
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
  approverName?: string;
  reviewerId?: string;
  reviewVersion?: number;
}) {
  const approverName = input.approverName?.trim() || "Cliente";
  const reviewerId = input.reviewerId?.trim() || legacyReviewerId(approverName);
  const applyChange = (approvals: PlanApprovals) => {
    const now = new Date().toISOString();
    const normalized = normalizeApprovals(approvals);
    const index = normalized.items.findIndex((item) => item.id === input.itemId);
    const current = index >= 0
      ? normalized.items[index]
      : { id: input.itemId, title: input.itemTitle, status: "pending" as ApprovalStatus, comment: "", responses: [] };
    const responses = [...(current.responses || [])];
    const responseIndex = responses.findIndex((response) => response.reviewerId === reviewerId);
    const currentResponse = responseIndex >= 0
      ? responses[responseIndex]
      : { reviewerId, approverName, status: "pending" as ApprovalStatus, comment: "", updatedAt: "" };
    const comment = input.comment.trim();

    if (currentResponse.status === input.status && currentResponse.comment === comment && current.title === input.itemTitle) {
      return null;
    }

    const nextResponse: ApprovalResponse = {
      reviewerId,
      approverName,
      status: input.status,
      comment,
      updatedAt: now,
      reviewVersion: input.reviewVersion,
    };
    if (responseIndex >= 0) responses[responseIndex] = nextResponse;
    else responses.push(nextResponse);

    const nextItem = aggregateApprovalItem({ ...current, title: input.itemTitle }, responses);
    const items = [...normalized.items];
    if (index >= 0) items[index] = nextItem;
    else items.push(nextItem);

    const action: ApprovalEvent["action"] = currentResponse.status !== input.status
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
      previousStatus: currentResponse.status,
      comment,
      createdAt: now,
      approverName,
      reviewerId,
      reviewVersion: input.reviewVersion,
    };
    const history = [...normalized.history, event];

    return {
      approvals: { ...normalized, planSlug: input.slug, items, history, updatedAt: now, reviewVersion: input.reviewVersion || normalized.reviewVersion || 1 },
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
    const metadataResult = await readVercelText(`${VERCEL_ROOT}/${metadataKey(slug)}`);
    if (!metadataResult) return null;
    const plan = JSON.parse(metadataResult.text) as Plan;
    const htmlResult = await readVercelText(`${VERCEL_ROOT}/${htmlKey(slug)}`);
    if (!htmlResult) return null;
    return { plan, html: htmlResult.text };
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
  client?: string;
  slug: string;
  originalName: string;
  html: string;
  size: number;
  kind?: PlanKind;
  approvalDeadline?: string;
  approvalPeriodDays?: number;
  reviewVersion?: number;
  versionUpdatedAt?: string;
}) {
  const existing = await getPlan(input.slug);
  const now = new Date().toISOString();
  const plan: Plan = {
    slug: input.slug,
    title: input.title,
    client: input.client?.trim() || existing?.plan.client,
    originalName: input.originalName,
    size: input.size,
    createdAt: existing?.plan.createdAt || now,
    updatedAt: now,
    kind: input.kind || existing?.plan.kind || "approval",
    approvalDeadline: input.approvalDeadline ?? existing?.plan.approvalDeadline,
    approvalPeriodDays: input.approvalPeriodDays ?? existing?.plan.approvalPeriodDays,
    reviewVersion: input.reviewVersion ?? existing?.plan.reviewVersion ?? 1,
    versionUpdatedAt: input.versionUpdatedAt ?? existing?.plan.versionUpdatedAt ?? now,
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

export async function setPlanApprovalPeriod(slug: string, days: number): Promise<Plan | null> {
  const existing = await getPlan(slug);
  if (!existing) return null;
  const plan: Plan = {
    ...existing.plan,
    kind: "approval",
    approvalPeriodDays: days,
    approvalDeadline: approvalDeadlineFromDays(days),
    updatedAt: new Date().toISOString(),
  };

  if (usesVercelBlobs()) {
    await putVercelBlob(`${VERCEL_ROOT}/${metadataKey(slug)}`, JSON.stringify(plan), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    return plan;
  }

  if (!usesNetlifyBlobs()) {
    await ensureLocalStore();
    await writeFile(localMetadataPath(slug), JSON.stringify(plan), "utf8");
    return plan;
  }

  await netlifyStore().setJSON(metadataKey(slug), plan);
  return plan;
}

async function backupLocalHtml(slug: string, html: string) {
  if (usesVercelBlobs() || usesNetlifyBlobs()) return;
  try {
    const dir = path.join(LOCAL_BACKUPS, slug);
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(path.join(dir, `${stamp}.html`), html, "utf8");
  } catch {
    // backup é best-effort; não impede a edição
  }
}

async function reopenAdjustedItems(slug: string, reviewVersion: number) {
  return mutatePlanApprovals(slug, (approvals) => {
    const normalized = normalizeApprovals(approvals);
    const adjusted = normalized.items.filter((item) => item.status === "changes_requested");
    if (!adjusted.length) return null;
    const now = new Date().toISOString();
    const adjustedIds = new Set(adjusted.map((item) => item.id));
    const items = normalized.items.map((item) => adjustedIds.has(item.id)
      ? aggregateApprovalItem({ ...item, status: "pending", comment: "", approverName: undefined, updatedAt: now }, [])
      : item);
    const history: ApprovalEvent[] = [
      ...normalized.history,
      ...adjusted.map((item) => ({
        id: randomUUID(),
        itemId: item.id,
        itemTitle: item.title,
        action: "reopened" as const,
        status: "pending" as const,
        previousStatus: "changes_requested" as const,
        comment: `Conteúdo reaberto para validação na versão ${reviewVersion}.`,
        createdAt: now,
        approverName: "Vizantu",
        reviewerId: `system-version-${reviewVersion}`,
        reviewVersion,
      })),
    ];
    return { ...normalized, items, history, updatedAt: now, reviewVersion };
  });
}

export async function updatePlanHtml(slug: string, html: string): Promise<Plan | null> {
  const existing = await getPlan(slug);
  if (!existing) return null;
  const approvals = await getPlanApprovals(slug);
  const currentVersion = existing.plan.reviewVersion || approvals.reviewVersion || 1;
  const startsNewVersion = isApprovalRoundComplete(approvals) && approvals.items.some((item) => item.status === "changes_requested");
  const nextVersion = startsNewVersion ? currentVersion + 1 : currentVersion;
  const versionUpdatedAt = startsNewVersion ? new Date().toISOString() : existing.plan.versionUpdatedAt;
  const approvalDeadline = startsNewVersion && existing.plan.approvalPeriodDays
    ? approvalDeadlineFromDays(existing.plan.approvalPeriodDays)
    : existing.plan.approvalDeadline;
  await backupLocalHtml(slug, existing.html);
  const plan = await savePlan({
    title: existing.plan.title,
    client: existing.plan.client,
    slug,
    originalName: existing.plan.originalName,
    html,
    size: Buffer.byteLength(html, "utf8"),
    kind: existing.plan.kind,
    approvalDeadline,
    approvalPeriodDays: existing.plan.approvalPeriodDays,
    reviewVersion: nextVersion,
    versionUpdatedAt,
  });
  if (startsNewVersion) await reopenAdjustedItems(slug, nextVersion);
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
