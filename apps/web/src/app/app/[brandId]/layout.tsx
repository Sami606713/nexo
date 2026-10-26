import type { ReactNode } from "react";
import { prisma } from "@postline/db";
import { requireBrand } from "@/lib/session";
import { AppShellLayout } from "@/components/shell/AppShellLayout";

export default async function BrandLayout({ children, params }: { children: ReactNode; params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { user, brand, membership } = await requireBrand(brandId);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <AppShellLayout
      brand={{ id: brand.id, name: brand.name, timezone: brand.timezone, weekStart: brand.weekStart }}
      role={membership.role}
      user={{ id: user.id, name: user.name, email: user.email, image: user.image }}
      brands={memberships.map((m) => ({ id: m.brand.id, name: m.brand.name, role: m.role }))}
    >
      {children}
    </AppShellLayout>
  );
}
