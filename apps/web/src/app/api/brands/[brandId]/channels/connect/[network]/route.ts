import { z } from "zod";
import { AdapterError } from "@postline/core";
import { getAdapter } from "@postline/integrations";
import { badRequest, parseBody, route } from "@/lib/http";
import { requireBrand } from "@/lib/session";
import { openPending, publicTarget, saveTargets, sealPending } from "@/lib/channels";
import { parseNetwork } from "@/lib/channels-oauth";

type Ctx = { params: Promise<{ brandId: string; network: string }> };

const schema = z.union([
  /** Step 1: submit the adapter's credentialFields. */
  z.object({ fields: z.record(z.string(), z.string()) }),
  /** Step 2 (only when step 1 returned several targets): pick which to connect. */
  z.object({ token: z.string().min(1), externalIds: z.array(z.string()).min(1, "Select at least one account") }),
]);

/**
 * Responses:
 *  - { connected, skipped, channels }                     → done
 *  - { pending: true, token, targets: [{externalId,name,username,avatarUrl}] } → let the user pick, then POST { token, externalIds }
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { brandId, network: seg } = await params;
  await requireBrand(brandId, "channels.connect");
  const network = parseNetwork(seg);
  const adapter = network ? getAdapter(network) : undefined;
  if (!network || !adapter) throw badRequest("This network isn't available yet");
  const body = await parseBody(req, schema);

  if ("token" in body) {
    const targets = openPending(body.token, brandId, network);
    if (!targets) throw badRequest("This selection expired. Please connect again.");
    const chosen = targets.filter((t) => body.externalIds.includes(t.externalId));
    if (!chosen.length) throw badRequest("Select at least one account");
    return saveTargets(brandId, chosen, { strict: true });
  }

  if (adapter.connectKind === "oauth2" || !adapter.connectWithCredentials) throw badRequest("This network connects via OAuth");
  const required = (adapter.credentialFields ?? []).filter((f) => f.required !== false);
  for (const f of required) if (!body.fields[f.name]?.trim()) throw badRequest(`${f.label} is required`);

  let targets;
  try {
    targets = await adapter.connectWithCredentials(body.fields);
  } catch (e) {
    if (e instanceof AdapterError) throw badRequest(e.message || "Couldn't connect with these details");
    throw e;
  }
  if (!targets.length) throw badRequest("No accounts were found for these details");
  if (targets.length === 1) return saveTargets(brandId, targets, { strict: true });
  return { pending: true, token: sealPending(brandId, network, targets), targets: targets.map(publicTarget) };
});
