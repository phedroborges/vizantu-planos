import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE, verifyClientSession } from "@/lib/client-session";
import { addSatisfactionScore, getClientById } from "@/lib/plans-db";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const clientId = verifyClientSession(cookieStore.get(CLIENT_SESSION_COOKIE)?.value);
  if (!clientId) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const body = await request.json();
  const score = Number(body?.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return NextResponse.json({ error: "Nota inválida." }, { status: 400 });
  }
  const client = await getClientById(clientId);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  await addSatisfactionScore(client.projectId, clientId, score);
  return NextResponse.json({ ok: true, score });
}
