/**
 * Short-lived, one-time issuance ticket for bridging Convex Auth to a Vercel
 * (or other) HTTPS endpoint that can return a binary .pkpass.
 *
 * Use this only if the Convex action path is not available. Preferred
 * integration is examples/convex-generate-pass-action.ts — Convex already
 * holds the session and can return base64 to the existing Wallet button.
 *
 * Properties:
 * - Ticket is created only after Convex Auth + accepted + not-checked-in checks
 * - Raw ticket is returned to the browser once; only a SHA-256 hash is stored
 * - Expires in 60 seconds
 * - Single redemption (atomic patch)
 * - Redemption re-validates eligibility so a checked-in user cannot download
 * - Browser never sends participant IDs, names, or QR tokens
 */

export const exampleTicketTable = `
walletPassTickets: defineTable({
  ticketHash: v.string(),
  participantId: v.id("participants"),
  expiresAt: v.number(),
  redeemedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_ticket_hash", ["ticketHash"])
`;

export const exampleCreateTicket = `
export const createWalletPassTicket = mutation({
  args: {},
  handler: async (ctx) => {
    const lookup = await loadEligibleRegistrationPass(ctx);
    if (lookup.status !== "ok") return lookup;

    const rawTicket = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const ticketHash = await sha256Hex(rawTicket);
    const now = Date.now();
    await ctx.db.insert("walletPassTickets", {
      ticketHash,
      participantId: lookup.participantId,
      expiresAt: now + 60_000,
      createdAt: now,
    });
    return { ok: true as const, ticket: rawTicket };
  },
});
`;

export const exampleRedeemTicket = `
export const redeemWalletPassTicket = mutation({
  args: { ticket: v.string() },
  handler: async (ctx, { ticket }) => {
    const ticketHash = await sha256Hex(ticket);
    const row = await ctx.db
      .query("walletPassTickets")
      .withIndex("by_ticket_hash", (q) => q.eq("ticketHash", ticketHash))
      .unique();
    const now = Date.now();
    if (!row || row.redeemedAt !== undefined || row.expiresAt <= now) {
      return { ok: false as const, code: "invalid_ticket" as const };
    }

    const participant = await ctx.db.get(row.participantId);
    if (!participant || participant.checkedInAt !== undefined || participant.badgeQrCodeToken) {
      return { ok: false as const, code: "already_checked_in" as const };
    }

    await ctx.db.patch(row._id, { redeemedAt: now });
    return {
      ok: true as const,
      serialNumber: \`hackuta-2026-\${participant._id}\`,
      attendeeName: await displayNameFor(ctx, participant),
      qrToken: participant.qrCodeToken,
    };
  },
});
`;
