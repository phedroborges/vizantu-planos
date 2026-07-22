import { NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedSlug } from "@/lib/slug";
import { updatePlanHtml } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HTML = 8 * 1024 * 1024;
const bodySchema = z.object({ html: z.string().min(1).max(MAX_HTML) });

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isAllowedSlug(slug)) return NextResponse.json({ error: "Endereço inválido." }, { status: 400 });

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Conteúdo do plano inválido." }, { status: 400 });

    const plan = await updatePlanHtml(slug, parsed.data.html);
    if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Falha ao salvar edição do plano", { slug, error });
    return NextResponse.json({ error: "Não foi possível salvar as alterações agora." }, { status: 500 });
  }
}
