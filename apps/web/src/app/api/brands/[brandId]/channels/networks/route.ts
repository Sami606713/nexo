import { NETWORK_LABELS } from "@postline/core";
import { availableNetworks, getAdapter } from "@postline/integrations";
import { route } from "@/lib/http";
import { requireBrand } from "@/lib/session";

type Ctx = { params: Promise<{ brandId: string }> };

/** [{ network, label, connectKind, credentialFields }] for networks with a working adapter. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { brandId } = await params;
  await requireBrand(brandId);
  return availableNetworks().flatMap((network) => {
    const a = getAdapter(network);
    if (!a) return [];
    return [{ network, label: NETWORK_LABELS[network], connectKind: a.connectKind, credentialFields: a.credentialFields ?? [] }];
  });
});
