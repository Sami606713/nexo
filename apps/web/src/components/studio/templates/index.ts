import { applyBrandColors, cloneScene, orientationOf, type Orientation, type Scene } from "../scene";
import { announcementTemplates } from "./announcement";
import { eventTemplates } from "./event";
import { hiringTemplates } from "./hiring";
import { launchTemplates } from "./launch";
import { promotionTemplates } from "./promotion";
import { quoteTemplates } from "./quote";
import { testimonialTemplates } from "./testimonial";
import { tipsTemplates } from "./tips";
import type { StudioTemplate } from "./kit";

export { TEMPLATE_CATEGORIES, type StudioTemplate, type TemplateCategory } from "./kit";

export const TEMPLATES: StudioTemplate[] = [
  ...promotionTemplates,
  ...quoteTemplates,
  ...announcementTemplates,
  ...tipsTemplates,
  ...eventTemplates,
  ...testimonialTemplates,
  ...hiringTemplates,
  ...launchTemplates,
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

export const templateOrientation = (t: StudioTemplate): Orientation => orientationOf(t.scene.width, t.scene.height);

/** A fresh copy of a template's scene, optionally recoloured with brand colours. */
export function instantiateTemplate(t: StudioTemplate, brandColors?: string[] | null): Scene {
  return brandColors?.length ? applyBrandColors(t.scene, t.accents, brandColors) : cloneScene(t.scene);
}
