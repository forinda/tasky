import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn's class helper. `clsx` resolves conditionals, `twMerge` resolves
 * Tailwind conflicts so a later `px-4` beats an earlier `px-2` instead of both
 * landing in the class list and letting CSS order decide.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
