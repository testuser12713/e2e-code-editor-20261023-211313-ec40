/**
 * Pure helpers for explorer file operations: validating a new file / folder
 * name (Windows rules) and joining / splitting workspace paths without Node.
 */

const INVALID_CHARS = /[\\/:*?"<>|]/;
/** true when the name holds a control character (code point below 32). */
function hasControlChar(name: string): boolean {
  for (let i = 0; i < name.length; i += 1) {
    if (name.charCodeAt(i) < 32) return true;
  }
  return false;
}
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
export const MAX_NAME_LENGTH = 255;

/**
 * Returns a user-facing message why `name` cannot be used, or null when it can.
 * `siblings` are the names already in the target folder (compared case-insensitively,
 * as Windows does); `current` is the entry's own name when renaming.
 */
export function validateName(name: string, siblings: readonly string[] = [], current?: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'A file or folder name must be provided.';
  if (trimmed === '.' || trimmed === '..') return `The name ${trimmed} is not a valid file or folder name.`;
  if (INVALID_CHARS.test(trimmed) || hasControlChar(trimmed)) return 'A name cannot contain any of these characters: \\ / : * ? " < > |';
  if (/[. ]$/.test(name)) return 'A name cannot end with a period or a space.';
  if (RESERVED.test(trimmed)) return `${trimmed} is reserved by Windows. Choose a different name.`;
  if (trimmed.length > MAX_NAME_LENGTH) return `A name can have at most ${MAX_NAME_LENGTH} characters.`;
  const lower = trimmed.toLowerCase();
  const own = current?.toLowerCase();
  if (lower !== own && siblings.some((s) => s.toLowerCase() === lower)) {
    return `A file or folder ${trimmed} already exists at this location. Choose a different name.`;
  }
  return null;
}

/** The separator a workspace path uses: backslash for Windows paths, else slash. */
export function separatorOf(path: string): '\\' | '/' {
  return path.includes('\\') || /^[a-z]:/i.test(path) ? '\\' : '/';
}

/** true for absolute Windows (C:\, \\server) and POSIX paths. */
export function isAbsolutePath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\') || path.startsWith('/');
}

/** Joins a folder and a name with the folder's own separator. */
export function joinPath(dir: string, name: string): string {
  const sep = separatorOf(dir);
  const clean = name.replace(/[\\/]+/g, sep).replace(/^[\\/]+/, '');
  return dir.endsWith('\\') || dir.endsWith('/') ? dir + clean : dir + sep + clean;
}

/** The last segment of a path. */
export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  return i === -1 ? trimmed : trimmed.slice(i + 1);
}

/** The folder containing a path (the path itself when it has no parent). */
export function parentPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (i <= 0) return trimmed;
  const parent = trimmed.slice(0, i);
  return /^[a-z]:$/i.test(parent) ? parent + trimmed[i] : parent;
}

/** true when `path` is `base` or lies below it (case-insensitive, either separator). */
export function isSameOrInside(path: string, base: string): boolean {
  const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const p = norm(path);
  const b = norm(base);
  return p === b || p.startsWith(b + '\\');
}

/** The part of a name a rename field preselects: everything before the last dot (unless leading). */
export function selectionEnd(name: string): number {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? dot : name.length;
}
