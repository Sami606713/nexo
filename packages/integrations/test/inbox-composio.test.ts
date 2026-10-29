import { describe, expect, it } from "vitest";
import { getInboxProvider, inboxSupported } from "../src/index";
import { mapRedditInbox, mapSlackMessages, mapYtThreads } from "../src/inbox/composio";

const composio = { extras: { via: "composio" } };

describe("composio inbox registry", () => {
  it("picks providers by how the channel was connected", () => {
    expect(getInboxProvider("INSTAGRAM", composio)?.network).toBe("INSTAGRAM");
    expect(getInboxProvider("YOUTUBE", composio)?.network).toBe("YOUTUBE");
    expect(getInboxProvider("LINKEDIN", composio)).toBeUndefined();
    expect(getInboxProvider("YOUTUBE", { extras: {} })).toBeUndefined();
    expect(inboxSupported("REDDIT", composio)).toBe(true);
    expect(inboxSupported("LINKEDIN", composio)).toBe(false);
    expect(inboxSupported("BLUESKY", composio)).toBe(false);
    expect(inboxSupported("BLUESKY", { extras: {} })).toBe(true);
  });
});

describe("YouTube mapping", () => {
  it("groups replies under the thread and marks our own replies OUT", () => {
    const items = mapYtThreads(
      [
        {
          id: "T1",
          snippet: {
            videoId: "v1",
            topLevelComment: { id: "T1", snippet: { textOriginal: "Great video", authorDisplayName: "Ali", authorChannelUrl: "http://www.youtube.com/@ali", authorChannelId: { value: "UCali" }, publishedAt: "2026-10-20T10:00:00Z" } },
          },
          replies: { comments: [{ id: "T1.r", snippet: { textOriginal: "Thanks!", authorDisplayName: "Me", authorChannelId: { value: "UCme" }, publishedAt: "2026-10-20T11:00:00Z" } }] },
        },
      ],
      "UCme",
      new Map([["v1", "My video"]]),
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "COMMENT", conversationExternalId: "T1", authorHandle: "ali", postExcerpt: "My video", direction: "IN" });
    expect(items[1]).toMatchObject({ conversationExternalId: "T1", direction: "OUT" });
    expect(mapYtThreads([], "UCme", new Map())).toEqual([]);
  });
});

describe("Reddit mapping", () => {
  it("maps comment replies, mentions and DMs and respects since", () => {
    const items = mapRedditInbox(
      [
        { kind: "t1", data: { name: "t1_a", author: "bob", body: "Nice", subject: "post reply", was_comment: true, created_utc: 1_793_000_000, context: "/r/x/comments/abc/t/a/", link_title: "My post" } },
        { kind: "t1", data: { name: "t1_m", author: "eve", body: "hey u/me", subject: "username mention", was_comment: true, created_utc: 1_793_000_000 } },
        { kind: "t4", data: { name: "t4_b", author: "carl", body: "Hi", created_utc: 1_793_000_000, first_message_name: "t4_root" } },
        { kind: "t4", data: { name: "t4_old", author: "carl", body: "Old", created_utc: 1_000 } },
      ],
      new Date(1_792_000_000_000),
    );
    expect(items.map((i) => [i.kind, i.conversationExternalId])).toEqual([
      ["COMMENT", "t1_a"],
      ["MENTION", "t1_m"],
      ["DM", "t4_root"],
    ]);
    expect(items[0]).toMatchObject({ postExternalId: "t3_abc", postExcerpt: "My post", url: "https://www.reddit.com/r/x/comments/abc/t/a/" });
  });
});

describe("Slack mapping", () => {
  it("threads by root ts and skips joins", () => {
    const items = mapSlackMessages(
      [
        { ts: "1793000000.000100", text: "Question?", user: "U1", user_profile: { real_name: "Sara" } },
        { ts: "1793000001.000200", text: "Answer", user: "UME", thread_ts: "1793000000.000100" },
        { ts: "1793000002.000300", text: "joined", user: "U2", subtype: "channel_join" },
      ],
      "C1",
      "UME",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ conversationExternalId: "1793000000.000100", authorName: "Sara", direction: "IN" });
    expect(items[1]).toMatchObject({ conversationExternalId: "1793000000.000100", direction: "OUT" });
  });
});
