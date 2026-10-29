import { randomInt } from 'crypto';

const LETTERS = 'abcdefghjkmnpqrstuvwxyz'; // no i, l, o: easy to read out and type

/**
 * A temporary password that is easy to share by message and type on a phone,
 * e.g. "Noor-4821-Kbtq". It meets the password rules (8+ characters, a capital
 * and a number) and must be changed at first sign-in.
 */
export function tempPassword() {
  const digits = String(randomInt(0, 10_000)).padStart(4, '0');
  const word = Array.from({ length: 4 }, () => LETTERS[randomInt(0, LETTERS.length)]).join('');
  return `Noor-${digits}-${word[0].toUpperCase()}${word.slice(1)}`;
}
