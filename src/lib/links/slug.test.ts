import { describe, expect, it, vi } from "vitest";
import { generateRandomSlug, RANDOM_SLUG_ALPHABET, RANDOM_SLUG_LENGTH } from "./slug";
import { isValidSlug } from "./validation";

describe("RANDOM_SLUG_ALPHABET", () => {
  it("has 31 characters without look-alikes", () => {
    expect(RANDOM_SLUG_ALPHABET).toHaveLength(31);
    for (const char of "01ilo") {
      expect(RANDOM_SLUG_ALPHABET).not.toContain(char);
    }
  });
});

describe("generateRandomSlug", () => {
  it("produces valid 6-character slugs from the alphabet", () => {
    for (let i = 0; i < 1000; i++) {
      const slug = generateRandomSlug();
      expect(slug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it("maps random indexes onto the alphabet", () => {
    expect(generateRandomSlug(() => 0)).toBe("222222");
    expect(generateRandomSlug((max) => max - 1)).toBe("zzzzzz");
  });

  it("asks for one index per character, below the alphabet length", () => {
    const randomIndex = vi.fn(() => 0);
    generateRandomSlug(randomIndex);
    expect(randomIndex).toHaveBeenCalledTimes(RANDOM_SLUG_LENGTH);
    expect(randomIndex).toHaveBeenCalledWith(RANDOM_SLUG_ALPHABET.length);
  });
});
