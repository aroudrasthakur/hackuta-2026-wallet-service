/**
 * The existing AddToAppleWalletButton in hackuta-2026-profile already:
 * 1. Calls a Convex action with the signed-in session (no extra args)
 * 2. Shows a loading label ("Preparing pass…")
 * 3. Surfaces the action's error message
 * 4. Downloads or opens the returned .pkpass
 *
 * After you point generateMyAppleWalletPass at this signing service
 * (examples/convex-generate-pass-action.ts), the button does not need a
 * rewrite. Do not POST the QR token, name, or participant id from the browser.
 *
 * If you switch to the Vercel ticket flow instead:
 */

export const exampleTicketButtonHandler = `
async function handleAddToWallet() {
  setLoading(true);
  try {
    const ticket = await convex.mutation(api.profile.createWalletPassTicket, {});
    if (!ticket.ok) {
      setErrorMessage(ticket.message);
      return;
    }
    const response = await fetch("/api/wallet-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: ticket.ticket }),
    });
    if (!response.ok) {
      setErrorMessage("We could not generate your Apple Wallet pass right now.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      window.location.assign(url);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "HackUTA-2026.pkpass";
    anchor.click();
    URL.revokeObjectURL(url);
  } finally {
    setLoading(false);
  }
}
`;
