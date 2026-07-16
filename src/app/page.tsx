import { headers } from "next/headers";
import { Dashboard } from "@/components/dashboard";
import { listPlans } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${protocol}://${host}` : "");
  let plans: Awaited<ReturnType<typeof listPlans>> = [];
  let storageError = "";

  try {
    plans = await listPlans();
  } catch (error) {
    console.error("Falha ao acessar o armazenamento", error);
    storageError = "O painel está aberto, mas o armazenamento ainda não foi conectado. Na Vercel, abra Storage, crie um Blob Store público e conecte-o a este projeto.";
  }

  return <Dashboard initialPlans={plans} siteUrl={siteUrl.replace(/\/$/, "")} storageError={storageError} />;
}
