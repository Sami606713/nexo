export const ROLES = ["OWNER", "ADMIN", "MANAGER", "CLIENT"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "brand.settings"
  | "members.manage"
  | "billing.manage"
  | "settings.other"
  | "posts.write"
  | "posts.approve"
  | "posts.viewDrafts"
  | "channels.connect"
  | "analytics.view";

const MATRIX: Record<Permission, readonly Role[]> = {
  "brand.settings": ["OWNER", "ADMIN"],
  "members.manage": ["OWNER", "ADMIN"],
  "billing.manage": ["OWNER", "ADMIN"],
  "settings.other": ["OWNER", "ADMIN", "MANAGER"],
  "posts.write": ["OWNER", "ADMIN", "MANAGER"],
  "posts.approve": ["OWNER", "ADMIN", "MANAGER", "CLIENT"],
  /** Clients don't see drafts or internally-pending posts. */
  "posts.viewDrafts": ["OWNER", "ADMIN", "MANAGER"],
  "channels.connect": ["OWNER", "ADMIN", "MANAGER", "CLIENT"],
  "analytics.view": ["OWNER", "ADMIN", "MANAGER", "CLIENT"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && MATRIX[permission].includes(role);
}
