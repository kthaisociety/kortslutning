import { randomInt } from "node:crypto";

/** Lowercase letters and digits without look-alikes (0/o, 1/l/i). */
export const RANDOM_SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const RANDOM_SLUG_LENGTH = 6;

/** `randomIndex(max)` must return an integer in [0, max). Injectable for tests. */
export function generateRandomSlug(randomIndex: (max: number) => number = (max) => randomInt(max)): string {
  let slug = "";
  for (let i = 0; i < RANDOM_SLUG_LENGTH; i++) {
    slug += RANDOM_SLUG_ALPHABET[randomIndex(RANDOM_SLUG_ALPHABET.length)];
  }
  return slug;
}
