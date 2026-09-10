import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Gộp className có điều kiện, đồng thời merge các Tailwind class conflict.
 *
 * @example
 * cn("p-2", isActive && "bg-indigo-600", "p-4")  // "bg-indigo-600 p-4"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
