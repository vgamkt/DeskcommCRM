import { notFound, redirect } from "next/navigation";

import { carregarFluxoParaEdicao } from "@/lib/followup/editar";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { FlowBuilder } from "./_components/FlowBuilder";

export const dynamic = "force-dynamic";

export default async function FollowupFlowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const flow = await carregarFluxoParaEdicao(supabase, { orgId: activeOrg.orgId, id });
  if (!flow) notFound();

  return (
    <div className="flex h-full flex-col">
      <FlowBuilder flowId={id} initialData={flow} />
    </div>
  );
}
