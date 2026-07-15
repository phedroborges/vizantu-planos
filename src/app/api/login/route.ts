import { NextResponse } from "next/server";
import { passwordMatches, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");
  try {
    if (!passwordMatches(password)) {
      return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
    }

    await setSessionCookie();
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    console.error("Falha na configuracao de autenticacao", error);
    return NextResponse.redirect(new URL("/login?error=config", request.url), 303);
  }
}
