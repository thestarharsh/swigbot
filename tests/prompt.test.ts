import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../lib/prompt";
import type { schema } from "../lib/db";

type User = typeof schema.users.$inferSelect;

const USER: User = {
  id: 1,
  platform: "telegram",
  platformUserId: "42",
  name: "Ada",
  createdAt: new Date(),
};

const { stable, dynamic } = buildSystemPrompt(USER, "telegram");

describe("buildSystemPrompt", () => {
  it("keeps the stable half free of per-user values, so it can be cached", () => {
    const other = buildSystemPrompt({ ...USER, id: 2, name: "Grace" }, "cli");
    expect(other.stable).toBe(stable);
    expect(dynamic).toContain("Ada");
  });

  it("teaches the UPI payment flow", () => {
    for (const needle of [
      "get_payment_options",
      "PENDING_PAYMENT",
      "bridgeUrl",
      "check_payment_status",
      "confirm_order",
      "cancel_booking",
    ]) {
      expect(stable, needle).toContain(needle);
    }
  });

  it("no longer claims the QR cannot be shown, or that Swiggy is cash-only", () => {
    expect(stable).not.toContain("YOU CANNOT SHOW IT");
    expect(stable).not.toContain("Cash on Delivery only");
    expect(stable).not.toMatch(/scan the QR/i);
  });

  it("never asks the user for coordinates - Swiggy geocodes the address text", () => {
    expect(stable).toContain("Omit latitude and longitude");
    expect(stable).not.toMatch(/ask[^.]{0,60}(latitude|longitude|coordinates|lat\/lng)/i);
  });

  it("never sends the user to the Swiggy app to manage addresses", () => {
    expect(stable).toContain("never tell a user to add or edit an address in the Swiggy app");
    // The app is still the right answer for order history and an unverifiable
    // booking; it must never be the answer for an address.
    for (const sentence of stable.split(/(?<=[.!?])\s+/)) {
      if (/Swiggy app/.test(sentence) && /address/i.test(sentence)) {
        expect(sentence, sentence).toMatch(/never/i);
      }
    }
  });
});
