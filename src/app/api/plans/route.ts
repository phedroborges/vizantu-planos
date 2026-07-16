import { NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedSlug, toSlug } from "@/lib/slug";
import { savePlan } from "@/lib/storage";

export const runtime = "nodejs";
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
    if (!(file instanceof File)) return NextResponse.json({ error: "Escolha um arquivo HTML." }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".html")) return NextResponse.json({ error: "O arquivo precisa ter extensão .html." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "O arquivo precisa ter entre 1 byte e 4 MB." }, { status: 400 });

    const html = await file.text();
    if (!/<html[\s>]|<!doctype\s+html/i.test(html)) {
      return NextResponse.json({ error: "O arquivo não parece ser um documento HTML completo." }, { status: 400 });
    }

    const plan = await savePlan({
      title: parsed.data.title,
      slug,
      originalName: file.name,
      html,
      size: file.size,
    });

    return NextResponse.json({ plan, url: `/${slug}` }, { status: 201 });
  } catch (error) {
    console.error("Falha ao publicar plano", error);
    return NextResponse.json({ error: "Não foi possível publicar o plano agora." }, { status: 500 });
  }
}
