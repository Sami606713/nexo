"use client";

import { createContext, useContext, type RefObject } from "react";
import type { CanvasApi } from "./canvas/StudioCanvas";

export interface BrandAssets {
  colors: string[];
  logos: { url: string; kind?: string }[];
}

export interface StudioCtx {
  brandId: string;
  designId: string;
  brand: BrandAssets;
  canvas: RefObject<CanvasApi | null>;
}

export const StudioContext = createContext<StudioCtx | null>(null);

export function useStudio(): StudioCtx {
  const v = useContext(StudioContext);
  if (!v) throw new Error("useStudio outside Studio");
  return v;
}
