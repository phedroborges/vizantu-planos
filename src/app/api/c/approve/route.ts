import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE, verifyClientSession } from "@/lib/client-session";
import { submitApproval } from "@/lib/plans-db";

const VALID_STATUSES = new Set(["approved", "changes_requested", "rejected"]);

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const clientId = verifyClientSession(cookieStore.get(CLIENT_SESSION_COOKIE)?.value);
  if (!clientId) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const body = await request.json();
  if (!body?.taskId || typeof body.taskId !== "string") {
    return NextResponse.json({ error: "Item inválido." }, { status: 400 });
  }
  if (!VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  if (!body?.reviewerName || typeof body.reviewerName !== "string" || !body.reviewerName.trim()) {
    return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
  }
  if ((body.status === "changes_requested" || body.status === "rejected") && (!body.comment || !String(body.comment).trim())) {
    return NextResponse.json({ error: "Escreva um comentário." }, { status: 400 });
  }

  const result = await submitApproval({
    taskId: body.taskId,
    clientId,
    reviewerName: body.reviewerName.trim(),
    status: body.status,
    comment: body.comment,
  });
  return NextResponse.json(result);
}
