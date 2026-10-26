import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@postline/db";
import { requireUser } from "@/lib/session";
import { LAST_BRAND_COOKIE } from "@/components/shell/constants";

export default async function AppIndex() {
  const user = await requireUser();
  const last = (await cookies()).get(LAST_BRAND_COOKIE)?.value;
  const memberships = await prisma.membership.findMany({ where: { userId: user.id }, select: { brandId: true }, orderBy: { createdAt: "asc" } });
  if (!memberships.length) redirect("/onboarding");
  const target = memberships.find((m) => m.brandId === last)?.brandId ?? memberships[0]!.brandId;
  redirect(`/app/${target}/planner`);
}
