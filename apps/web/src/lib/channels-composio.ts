import "server-only";

export const COMPOSIO_COOKIE = "pl_composio";
export const COMPOSIO_COOKIE_PATH = "/api/channels/composio";

/** One Composio user per brand, so each brand's connected accounts stay separate. */
export const composioUserId = (brandId: string) => `brand_${brandId}`;
