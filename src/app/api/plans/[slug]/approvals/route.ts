import { NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedSlug } from "@/lib/slug";
import { getPlanApprovals, recordApproval, summarizeApprovals, syncApprovalItems } from "@/lib/storage";

export const runtime = "nodejs";

const itemId = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const itemTitle = z.string().trim().min(1).max(240);
const payloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sync"),
    items: z.array(z.object({ id: itemId, title: itemTitle })).min(1).max(100),
  }),
  z.object({
    action: z.literal("record"),
    itemId,
    itemTitle,
    status: z.enum(["pending", "approved", "changes_requested"]),
    comment: z.string().max(2000).default(""),
    approverName: z.string().trim().max(120).optional(),
  }),
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { ...corsHeaders, ...init?.headers } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return json({ error: "Endereço inválido." }, { status: 400 });
  const approvals = await getPlanApprovals(slug);
  return json({ approvals, summary: summarizeApprovals(approvals) });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return json({ error: "Endereço inválido." }, { status: 400 });

  try {
    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Revise os dados da avaliação." }, { status: 400 });

    const approvals = parsed.data.action === "sync"
      ? await syncApprovalItems(slug, parsed.data.items)
      : await recordApproval({
          slug,
          itemId: parsed.data.itemId,
          itemTitle: parsed.data.itemTitle,
          status: parsed.data.status,
          comment: parsed.data.comment,
          approverName: parsed.data.approverName,
        });

    return json({ approvals, summary: summarizeApprovals(approvals) });
  } catch (error) {
    console.error("Falha ao salvar aprovação", { slug, error });
    return json({ error: "Não foi possível salvar a avaliação agora." }, { status: 500 });
  }
}
