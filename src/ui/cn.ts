/** A class value: a class name, or a falsy value that contributes nothing. */
export type ClassValue = string | false | null | undefined;

/**
 * Joins class names, skipping falsy entries. Every conditional class of the
 * renderer goes through this helper instead of template strings.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter((c): c is string => typeof c === 'string' && c.length > 0).join(' ');
}
