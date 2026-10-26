import "server-only";
import { prisma } from "@postline/db";
import { enqueueWorkflowRun } from "@/lib/queue";

export interface InboxWorkflowEvent {
  type: "new_comment" | "new_mention" | "new_dm";
  channelId: string;
  postExternalId?: string;
  conversationId: string;
  text: string;
  authorName: string;
  authorHandle?: string;
}

interface InboxTriggerConfig {
  /** Empty / missing = any channel of the brand. */
  channelId?: string | null;
  /** new_comment only: restrict to comments on one post (network id). Empty = any post. */
  postExternalId?: string | null;
}

/**
 * Called by the inbox sync when a new comment / mention / DM arrives.
 * Finds active workflows of the brand whose trigger matches and queues one run each.
 * Never throws (inbox sync must not fail because of workflows); returns the number of runs queued.
 */
export async function dispatchInboxEvent(brandId: string, event: InboxWorkflowEvent): Promise<number> {
  try {
    const workflows = await prisma.workflow.findMany({ where: { brandId, active: true }, select: { id: true, trigger: true } });
    let queued = 0;
    for (const wf of workflows) {
      const trigger = (wf.trigger ?? {}) as { type?: string; config?: InboxTriggerConfig };
      if (trigger.type !== event.type) continue;
      const cfg = trigger.config ?? {};
      if (cfg.channelId && cfg.channelId !== event.channelId) continue;
      if (event.type === "new_comment" && cfg.postExternalId && cfg.postExternalId !== event.postExternalId) continue;
      await enqueueWorkflowRun({
        workflowId: wf.id,
        input: {
          text: event.text,
          authorName: event.authorName,
          authorHandle: event.authorHandle ?? "",
          channelId: event.channelId,
          conversationId: event.conversationId,
          postExternalId: event.postExternalId ?? "",
          eventType: event.type,
        },
      });
      queued++;
    }
    return queued;
  } catch (err) {
    console.error("[workflows] dispatchInboxEvent failed", err);
    return 0;
  }
}
