import { NextResponse } from "next/server";
import { z } from "zod";
import { PlanPackageError, preparePlanFile } from "@/lib/plan-package";
import { isAllowedSlug, toSlug } from "@/lib/slug";
import { savePlan } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_FILE_SIZE = 4 * 1024 * 1024;

const inputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  slug: z.string().trim().min(3).max(80),
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const parsed = inputSchema.safeParse({
      title: String(formData.get("title") || ""),
      slug: String(formData.get("slug") || ""),
    });
    if (!parsed.success) return NextResponse.json({ error: "Revise o título e o endereço do plano." }, { status: 400 });

    const slug = toSlug(parsed.data.slug);
    if (!isAllowedSlug(slug)) return NextResponse.json({ error: "Este endereço não pode ser utilizado." }, { status: 400 });

    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Escolha um arquivo HTML ou ZIP." }, { status: 400 });
    if (!/\.(?:html|zip)$/i.test(file.name)) return NextResponse.json({ error: "O arquivo precisa ter extensão .html ou .zip." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "O arquivo precisa ter entre 1 byte e 4 MB." }, { status: 400 });

    const prepared = await preparePlanFile(file);

    const plan = await savePlan({
      title: parsed.data.title,
      slug,
      originalName: prepared.originalName,
      html: prepared.html,
      size: prepared.size,
    });

    return NextResponse.json({ plan, url: `/${slug}` }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanPackageError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Falha ao publicar plano", error);
    return NextResponse.json({ error: "Não foi possível publicar o plano agora." }, { status: 500 });
  }
}
