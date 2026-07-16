import { NextResponse } from "next/server";
import { isAllowedSlug } from "@/lib/slug";
import { deletePlan } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return NextResponse.json({ error: "Endereço inválido." }, { status: 400 });
  const deleted = await deletePlan(slug);
  if (!deleted) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
