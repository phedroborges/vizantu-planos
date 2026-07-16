import { headers } from "next/headers";
import { Dashboard } from "@/components/dashboard";
import { listPlans } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${protocol}://${host}` : "");
  const plans = await listPlans();
  return <Dashboard initialPlans={plans} siteUrl={siteUrl.replace(/\/$/, "")} />;
}
