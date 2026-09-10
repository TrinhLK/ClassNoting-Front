export const buttonIntents = [
  "primary", "secondary", "danger", "ghost", "success", "outline",
] as const;
export type ButtonIntent = (typeof buttonIntents)[number];

export const buttonSizes = ["sm", "md", "lg"] as const;
export type ButtonSize = (typeof buttonSizes)[number];

export const badgeIntents = [
  "neutral", "primary", "success", "warning", "danger", "info",
] as const;
export type BadgeIntent = (typeof badgeIntents)[number];

export const cardElevations = ["flat", "raised", "overlay"] as const;
export type CardElevation = (typeof cardElevations)[number];

export const modalSizes = ["sm", "md", "lg", "xl", "full"] as const;
export type ModalSize = (typeof modalSizes)[number];

export const avatarSizes = ["xs", "sm", "md", "lg", "xl"] as const;
export type AvatarSize = (typeof avatarSizes)[number];

export const speakerColorSchemes = [
  { bg: "bg-indigo-100", text: "text-indigo-700", ring: "ring-indigo-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
  { bg: "bg-sky-100", text: "text-sky-700", ring: "ring-sky-200" },
  { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200" },
  { bg: "bg-teal-100", text: "text-teal-700", ring: "ring-teal-200" },
  { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-200" },
] as const;
