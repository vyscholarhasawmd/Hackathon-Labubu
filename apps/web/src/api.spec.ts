import { describe, expect, it } from "vitest";
import { tokenIsCurrent } from "./api";

function tokenWithExpiry(exp: number): string {
  const payload = btoa(JSON.stringify({ exp }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `header.${payload}.signature`;
}

describe("API session handling", () => {
  it("accepts a JWT that remains valid for more than 30 seconds", () => {
    expect(tokenIsCurrent(tokenWithExpiry(Math.floor(Date.now() / 1000) + 120))).toBe(true);
  });

  it("rejects expired, nearly expired and malformed JWTs", () => {
    expect(tokenIsCurrent(tokenWithExpiry(Math.floor(Date.now() / 1000) - 1))).toBe(false);
    expect(tokenIsCurrent(tokenWithExpiry(Math.floor(Date.now() / 1000) + 10))).toBe(false);
    expect(tokenIsCurrent("not-a-jwt")).toBe(false);
  });
});
