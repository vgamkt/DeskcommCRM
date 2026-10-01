import { redirect } from "next/navigation";

import { ROLE_RANK } from "@/lib/auth/types";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { ResumoDeConversasClient } from "./_components/ResumoDeConversasClient";

export const dynamic = "force-dynamic";

export default async function ResumoDeConversasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  return <ResumoDeConversasClient />;
}