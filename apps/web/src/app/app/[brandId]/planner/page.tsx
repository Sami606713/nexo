import { requireBrand } from "@/lib/session";
import { Planner, type PlannerView } from "@/components/planner/Planner";

const VIEWS: PlannerView[] = ["list", "calendar", "board"];

export default async function PlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { brandId } = await params;
  await requireBrand(brandId);
  const { view } = await searchParams;
  const initialView = VIEWS.includes(view as PlannerView) ? (view as PlannerView) : "list";
  return <Planner initialView={initialView} />;
}
