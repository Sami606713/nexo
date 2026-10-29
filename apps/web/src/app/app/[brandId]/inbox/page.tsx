import type { Metadata } from "next";
import { Container } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { requireBrand } from "@/lib/session";
import { INBOX_RELEASED } from "@/lib/features";
import { InboxView } from "@/components/inbox/InboxView";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  await requireBrand(brandId);
  if (!INBOX_RELEASED) {
    return (
      <Container size="sm" py="xl">
        <EmptyState
          icon={<IconLock size={28} />}
          title="Inbox is coming soon"
          description="Read and reply to comments and messages from all your channels in one place. We're putting the finishing touches on it."
        />
      </Container>
    );
  }
  return <InboxView />;
}
