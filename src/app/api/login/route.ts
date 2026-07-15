import { NextResponse } from "next/server";
import { passwordMatches, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");
  if (!passwordMatches(password)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  await setSessionCookie();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
