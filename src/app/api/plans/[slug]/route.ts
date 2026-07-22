import { NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedSlug } from "@/lib/slug";
import { deletePlan, setPlanApprovalPeriod, setPlanKind } from "@/lib/storage";

export const runtime = "nodejs";

const patchSchema = z.union([
  z.object({ kind: z.enum(["approval", "presentation"]) }),
  z.object({ approvalDays: z.number().int().min(1).max(3650) }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return NextResponse.json({ error: "Endereço inválido." }, { status: 400 });

  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Tipo de material inválido." }, { status: 400 });
    const plan = "approvalDays" in parsed.data
      ? await setPlanApprovalPeriod(slug, parsed.data.approvalDays)
      : await setPlanKind(slug, parsed.data.kind);
    if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Falha ao atualizar o tipo do plano", { slug, error });
    return NextResponse.json({ error: "Não foi possível atualizar o plano agora." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return NextResponse.json({ error: "Endereço inválido." }, { status: 400 });
  const deleted = await deletePlan(slug);
  if (!deleted) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
