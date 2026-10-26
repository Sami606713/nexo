import { z } from "zod";
import { prisma } from "@postline/db";
import { HttpError, parseBody, route } from "@/lib/http";
import { appUrl, demoBilling, stripe } from "../_lib/stripe";
import { billingTarget } from "../_lib/target";

/** POST {brandId?} → {url} of a Stripe billing portal session (invoices, payment method, plan changes). */
export const POST = route(async (req) => {
  const body = await parseBody(req, z.object({ brandId: z.string().optional() }));
  const { user, brandId } = await billingTarget(body.brandId);
  const s = stripe();
  if (!s) {
    if (demoBilling()) return { demo: true, url: null };
    throw new HttpError(503, "Billing isn't configured on this server");
  }
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id }, select: { stripeCustomerId: true } });
  if (!sub?.stripeCustomerId) throw new HttpError(400, "Choose a plan first — there are no invoices yet");
  const portal = await s.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: brandId ? `${appUrl()}/app/${brandId}/settings/billing` : `${appUrl()}/app`,
  });
  return { url: portal.url };
});
