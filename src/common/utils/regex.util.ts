/** Escapes a user-supplied string for literal use inside a RegExp / $regex. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
