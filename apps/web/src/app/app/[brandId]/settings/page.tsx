import { redirect } from "next/navigation";

export default async function SettingsIndex({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  redirect(`/app/${brandId}/settings/team`);
}
