import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { isAuthenticated } from "@/lib/auth";
import { listPlans } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isAuthenticated())) redirect("/login");
  const plans = await listPlans();
  return <Dashboard initialPlans={plans} />;
}
