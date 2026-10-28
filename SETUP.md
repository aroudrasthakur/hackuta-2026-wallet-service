# Setup: HackUTA Wallet Service

This is the operator guide for **hackuta-2026-wallet-service**. Use it to:

1. Set up this repository locally.
2. Host the signer (usually the Apple Developer account owner).
3. Point the HackUTA profile site at it so **Add to Apple Wallet** issues a real pass.

The participant browser must **never** call this service. Profile already authenticates the hacker in Convex, then the Convex backend calls `POST /passes/generate` with a shared API key.

Start here. Architecture, API details, and troubleshooting live in [README.md](./README.md).

---

## Who does what

| Person | Does |
| --- | --- |
| **Apple Developer account owner** | Creates the Pass Type ID, exports signing PEMs, hosts this service (or hands PEMs to whoever hosts it). Sends HackUTA the HTTPS URL + API key only. |
| **HackUTA website (profile / Convex)** | Verifies the participant is signed in, accepted, and not checked in. Sends `serialNumber`, `attendeeName`, and the existing registration `qrToken`. Delivers the `.pkpass` to the **Add to Apple Wallet** button. |
| **Participant** | Taps the button on `/dashboard/scan`. Never supplies IDs, names, or QR tokens. |

---

## 1. Set up the repository

Requires **Node.js 22+** and npm.

```bash
git clone <this-repo-url>
cd hackuta-2026-wallet-service
npm ci
npm run verify
```

`npm run verify` runs typecheck, lint, tests, and the production build.

### Local development (no Apple certificates)

Copy the development env file:

```bash
cp .env.development.example .env
# set WALLET_SERVICE_API_KEY to any 32+ character secret
npm run dev
```

Then:

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok","service":"hackuta-wallet-service"}
```

Authenticated generate returns **503** until real PEMs are configured. That is expected. Unsigned or placeholder files will **not** install in Apple Wallet.

---

## 2. Apple signing certificates (account owner)

On a Mac signed into the Apple Developer account:

1. [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → **+** → **Pass Type IDs**.
2. Description `HackUTA 2026`. Identifier e.g. `pass.com.hackuta.2026` — this must match `APPLE_PASS_TYPE_IDENTIFIER`.
3. [Certificates](https://developer.apple.com/account/resources/certificates/list) → **+** → **Pass Type ID Certificate** → that identifier.
4. Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority → save CSR to disk → upload → download the certificate → double-click to install.
5. Export the cert from Keychain as a `.p12`. Keep the `.p12` on this machine.

Convert to PEMs (see [certs/README.md](./certs/README.md)):

```bash
mkdir -p certs
openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out certs/signerCert.pem
openssl pkcs12 -in Certificates.p12 -nocerts -nodes -out certs/signerKey.pem

# WWDR G4: https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform der -in AppleWWDRCAG4.cer -out certs/wwdr.pem

chmod 644 certs/signerCert.pem certs/wwdr.pem
chmod 644 certs/signerKey.pem   # dedicated host; container user must be able to read
```

Team ID is on the Apple Developer membership page (10 characters, e.g. `ABCDE12345`).

Do not commit PEMs, `.p12` files, or a filled `.env`. They are gitignored.

---

## 3. Host the service

Preferred: the certificate owner runs Docker on a small VPS (DigitalOcean, Hetzner, Fly, campus VM). A $6 instance is enough. Convex Cloud must be able to reach it over **public HTTPS**.

```bash
cp .env.example .env
# Fill WALLET_SERVICE_API_KEY (openssl rand -hex 32)
# Fill APPLE_TEAM_IDENTIFIER and APPLE_PASS_TYPE_IDENTIFIER
# Leave APPLE_*_PATH as /certs/... for Compose

docker compose up --build -d
curl http://127.0.0.1:3000/health
```

Compose bind-mounts `./certs` at `/certs` (read-only). Certificates are not copied into the image.

### HTTPS

Do not serve this on port 3000 publicly. Put TLS in front. [Caddyfile.example](./Caddyfile.example):

```caddy
wallet.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Install Caddy, point DNS at the VPS, replace the hostname, restart Caddy.

Firewall: allow 22 and 443. Do not expose 3000. CORS is intentionally off.

Confirm:

```bash
curl https://wallet.example.com/health
```

### What to send HackUTA

Only:

- `WALLET_SERVICE_URL` = `https://wallet.example.com` (no trailing slash)
- `WALLET_SERVICE_API_KEY` = the same secret as `.env`

Never send the Apple login, `.p12`, or PEM files.

---

## 4. Connect the HackUTA website

The profile app (`hackuta-2026-profile`) already:

- Authenticates with Convex Auth
- Loads the accepted, not-checked-in participant
- Shows **Add to Apple Wallet** on `/dashboard/scan`
- Calls `profile/appleWalletPass:generateMyAppleWalletPass` with **no client arguments**

Today that action signs locally from Convex PEM env vars. Point it at this service instead.

### 4.1 Convex environment

In the profile Convex dashboard (or `npx convex env set` from **hackuta-2026-profile**):

```bash
npx convex env set WALLET_SERVICE_URL https://wallet.example.com
npx convex env set WALLET_SERVICE_API_KEY "<same 32+ char secret as the wallet host>"
```

Set both on the **dev** deployment (`standing-manatee-425`) and on **production** when you go live.

You can remove Convex `APPLE_PASS_SIGNER_*` PEMs once this service is the signer. Keep `APPLE_PASS_TYPE_IDENTIFIER` / team ID only if something else still reads them.

### 4.2 Backend request (Convex Node action)

Replace the local `buildSignedAppleWalletPassBuffer(...)` call with a server-side fetch. Keep the existing eligibility query. Full copy-paste: [examples/convex-generate-pass-action.ts](./examples/convex-generate-pass-action.ts).

The JSON body this service accepts:

```json
{
  "serialNumber": "hackuta-2026-<participantId>",
  "attendeeName": "Jane Q. Hacker",
  "qrToken": "<participants.qrCodeToken, still the registration token>"
}
```

| Field | Source in profile | Why |
| --- | --- | --- |
| `serialNumber` | `formatAppleWalletSerialNumber(participant._id)` | Stable Wallet identity; do not randomize per download |
| `attendeeName` | Application first + last name | Shown on the pass |
| `qrToken` | `participants.qrCodeToken` **before** badge check-in | Same token volunteers already scan |

Headers the Convex action must send:

```
Authorization: Bearer <WALLET_SERVICE_API_KEY>
Content-Type: application/json
Accept: application/vnd.apple.pkpass
```

Success is **binary** `.pkpass`, not JSON. Base64 it (and optionally stash a short-lived Convex storage URL) so the existing button can download or open it.

Do **not**:

- Put `WALLET_SERVICE_API_KEY` in `VITE_*` or any frontend env
- POST names, IDs, or QR tokens from the browser
- Generate a new QR in this service

### 4.3 Frontend

No button rewrite is required if the action keeps returning:

```ts
{ ok: true, passUrl, pkpassBase64, filename, serialNumber }
```

or `{ ok: false, code, message }`.

`src/components/participant/AddToAppleWalletButton.tsx` already handles loading and errors.

---

## 5. End-to-end check

1. Wallet host: `GET /health` is `200`.
2. From a machine that is **not** the VPS:

   ```bash
   curl -sS -D - -o /tmp/HackUTA-2026.pkpass \
     -H "Authorization: Bearer $WALLET_SERVICE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"serialNumber":"hackuta-2026-demo","attendeeName":"Jane Q. Hacker","qrToken":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' \
     https://wallet.example.com/passes/generate
   ```

   Expect `Content-Type: application/vnd.apple.pkpass` and a non-empty file. `file /tmp/HackUTA-2026.pkpass` should look like a Zip (`PK`).
3. Profile: sign in as an **accepted, not checked-in** participant.
4. Open `/dashboard/scan` → **Add to Apple Wallet**.
5. On iPhone, the pass should offer Add. The QR in Wallet must match the on-screen registration QR.
6. After volunteer badge check-in, the profile QR disappears. The installed Wallet pass is stale on purpose; later scans use the physical badge.

Android / desktop only downloads the file. Only iOS/macOS Wallet installs it.

---

## 6. Checklist

**Repo**

- [ ] `npm ci` and `npm run verify` succeed

**Signer host**

- [ ] Pass Type ID matches `APPLE_PASS_TYPE_IDENTIFIER`
- [ ] Team ID is 10 characters
- [ ] `signerCert.pem`, `signerKey.pem`, `wwdr.pem` exist and the container can read them
- [ ] `WALLET_SERVICE_API_KEY` is ≥ 32 characters
- [ ] `NODE_ENV=production`
- [ ] `docker compose up --build -d` + Caddy (or equivalent) HTTPS
- [ ] `/health` is `200` on the public hostname

**HackUTA Convex**

- [ ] `WALLET_SERVICE_URL` and `WALLET_SERVICE_API_KEY` set on the same deployment the profile app uses
- [ ] `generateMyAppleWalletPass` fetches this service instead of signing locally
- [ ] Button still calls the action with no extra arguments
- [ ] One real iPhone install before opening the button to everyone

---

## 7. Common failures

| Symptom | Fix |
| --- | --- |
| Service will not boot in production | Missing or invalid PEM path; check container logs |
| Generate returns 503 | Dev mode without certs, or files not mounted / not readable |
| Generate returns 401 | API key mismatch between Convex and this `.env` |
| Profile says “not configured” | Convex env vars missing on that deployment |
| Pass will not install on iPhone | Cert does not match Pass Type ID, or WWDR missing |
| QR does not scan at check-in | Backend sent a different token than `participants.qrCodeToken` |
| CORS errors in the browser | The frontend is calling this service — stop; only Convex may call it |
