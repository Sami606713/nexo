"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { can as canRole, type Permission, type Role } from "@postline/core";

export interface BrandContextValue {
  brandId: string;
  /** Brand name. */
  name: string;
  timezone: string;
  /** 0 = Sunday, 1 = Monday. */
  weekStart: number;
  role: Role;
  user: { id: string; name: string | null; email: string; image: string | null };
  can: (permission: Permission) => boolean;
}

export interface BrandProviderProps {
  brand: { id: string; name: string; timezone: string; weekStart: number };
  role: Role;
  user: BrandContextValue["user"];
  children: ReactNode;
}

const Ctx = createContext<BrandContextValue | null>(null);

export function BrandProvider({ brand, role, user, children }: BrandProviderProps) {
  const value = useMemo<BrandContextValue>(
    () => ({
      brandId: brand.id,
      name: brand.name,
      timezone: brand.timezone,
      weekStart: brand.weekStart,
      role,
      user,
      can: (p: Permission) => canRole(role, p),
    }),
    [brand.id, brand.name, brand.timezone, brand.weekStart, role, user],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Current brand + caller's role. Only usable under /app/[brandId]/**. */
export function useBrand(): BrandContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBrand() must be used inside /app/[brandId] (BrandProvider)");
  return v;
}
