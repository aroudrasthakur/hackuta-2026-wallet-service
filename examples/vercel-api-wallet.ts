/**
 * Optional Vercel serverless delivery if you do not want Convex to fetch the
 * binary pass. The browser still must not send names, QR tokens, or
 * participant IDs. It only sends a short-lived one-time issuance ticket
 * created by Convex after session + eligibility checks.
 *
 * See examples/issuance-ticket-pattern.ts and the README.
 */

export const exampleVercelHandler = `
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const ticket = typeof req.body?.ticket === "string" ? req.body.ticket : "";
  if (!ticket) {
    res.status(400).json({ error: "missing_ticket" });
    return;
  }

  const redeemed = await redeemIssuanceTicket(ticket);
  if (!redeemed.ok) {
    res.status(redeemed.status).json({ error: redeemed.code });
    return;
  }

  const walletResponse = await fetch(
    \`\${process.env.WALLET_SERVICE_URL}/passes/generate\`,
    {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${process.env.WALLET_SERVICE_API_KEY}\`,
        "Content-Type": "application/json",
        Accept: "application/vnd.apple.pkpass",
      },
      body: JSON.stringify({
        serialNumber: redeemed.serialNumber,
        attendeeName: redeemed.attendeeName,
        qrToken: redeemed.qrToken,
      }),
    },
  );

  if (!walletResponse.ok) {
    res.status(502).json({ error: "signing_failed" });
    return;
  }

  const bytes = Buffer.from(await walletResponse.arrayBuffer());
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Content-Disposition", 'attachment; filename="HackUTA-2026.pkpass"');
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(bytes);
}

async function redeemIssuanceTicket(_ticket: string): Promise<
  | { ok: true; serialNumber: string; attendeeName: string; qrToken: string }
  | { ok: false; status: number; code: string }
> {
  // Call a Convex mutation that:
  // 1. Looks up the hashed ticket
  // 2. Rejects expired, already-used, or unknown tickets
  // 3. Marks it redeemed atomically
  // 4. Re-checks the participant is still accepted and not checked in
  // 5. Returns serialNumber, attendeeName, and the registration QR token
  throw new Error("Wire this to Convex — see examples/issuance-ticket-pattern.ts");
}
`;
