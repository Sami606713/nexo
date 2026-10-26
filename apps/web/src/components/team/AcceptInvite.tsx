"use client";

import { useState } from "react";
import { Button } from "@mantine/core";
import { api } from "@/lib/fetcher";
import { notifyError, notifySuccess } from "@/components/ui/notify";

export function AcceptInvite({ token, brandName }: { token: string; brandName: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      fullWidth
      size="md"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const { brandId } = await api<{ brandId: string }>(`/api/invites/${token}/accept`, "POST");
          notifySuccess(`You joined ${brandName}`);
          window.location.href = `/app/${brandId}/planner`;
        } catch (e) {
          notifyError(e);
          setLoading(false);
        }
      }}
    >
      Accept invitation
    </Button>
  );
}
