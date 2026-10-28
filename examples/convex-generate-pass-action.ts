/**
 * Copy-paste example for hackuta-2026-profile.
 *
 * Do not call the wallet service from the browser. Keep Convex Auth checks
 * in getMyAppleWalletPassInput, then have this Node action POST the verified
 * serial number, display name, and registration QR token with the server-side
 * API key.
 *
 * Convex env:
 *   WALLET_SERVICE_URL=https://wallet.example.com
 *   WALLET_SERVICE_API_KEY=<same secret as the wallet service>
 *
 * This file is documentation. It is not imported by the wallet service.
 */

export const exampleConvexAction = `
"use node";

import { action } from "../_generated/server";
import { makeFunctionReference } from "convex/server";

const getMyAppleWalletPassInputRef = makeFunctionReference<
  "query",
  Record<string, never>,
  | { status: "unauthenticated" | "not_eligible" | "already_checked_in" }
  | {
      status: "ok";
      passInput: {
        serialNumber: string;
        displayName: string;
        qrCodeToken: string;
      };
    }
>("profile/appleWalletPassData:getMyAppleWalletPassInput");

export const generateMyAppleWalletPass = action({
  args: {},
  handler: async (ctx) => {
    const lookup = await ctx.runQuery(getMyAppleWalletPassInputRef, {});
    if (lookup.status !== "ok") {
      return {
        ok: false as const,
        code: lookup.status,
        message:
          lookup.status === "already_checked_in"
            ? "You have already checked in. Your physical badge is now your event pass."
            : "You are not eligible for an Apple Wallet pass.",
      };
    }

    const baseUrl = process.env.WALLET_SERVICE_URL?.replace(/\\/$/, "");
    const apiKey = process.env.WALLET_SERVICE_API_KEY;
    if (!baseUrl || !apiKey) {
      return {
        ok: false as const,
        code: "not_configured" as const,
        message: "Apple Wallet is not configured.",
      };
    }

    const response = await fetch(\`\${baseUrl}/passes/generate\`, {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${apiKey}\`,
        "Content-Type": "application/json",
        Accept: "application/vnd.apple.pkpass",
      },
      body: JSON.stringify({
        serialNumber: lookup.passInput.serialNumber,
        attendeeName: lookup.passInput.displayName,
        qrToken: lookup.passInput.qrCodeToken,
      }),
    });

    if (!response.ok) {
      return {
        ok: false as const,
        code: "signing_failed" as const,
        message: "We could not generate your Apple Wallet pass right now.",
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ok: true as const,
      passUrl: null,
      pkpassBase64: bytes.toString("base64"),
      filename: "HackUTA-2026.pkpass",
      serialNumber: lookup.passInput.serialNumber,
    };
  },
});
`;
