# HackUTA Wallet Service

**Operators: start with [SETUP.md](./SETUP.md)** (clone, certificates, Docker/HTTPS, and connecting the HackUTA profile site).

Standalone Apple Wallet pass **signing** microservice for HackUTA 2026.

It does one job: an authenticated backend sends a verified participant name, a **stable serial number**, and the **existing registration QR token**. This service returns a signed `.pkpass` event ticket. It has no database, no Convex credentials, and no participant login.

The public profile app must **never** call this service. Only the HackUTA backend (Convex Node action, or a Vercel function that redeems a Convex-issued ticket) may call it.

A valid Apple-signed pass cannot be confirmed until the Apple Developer account owner mounts real Pass Type ID certificates. Unsigned or placeholder passes will **not** install in Apple Wallet.

## 1. What this service does

- `GET /health` — liveness only. No secrets.
- `POST /passes/generate` — Bearer-authenticated; returns `application/vnd.apple.pkpass`.

The pass is a **pre-check-in** event ticket. After a volunteer binds a physical badge, HackUTA Convex invalidates the registration QR. This service does not revoke or update installed passes.

## 2. Architecture

```
iPhone / browser
    │  Convex Auth session
    ▼
hackuta-2026-profile
    │  Convex action (server-side)
    │  1. Verify session
    │  2. Load accepted participant
    │  3. Reject if already checked in
    │  4. Read registration QR + stable serial
    ▼
this service  POST /passes/generate
    Authorization: Bearer WALLET_SERVICE_API_KEY
    │  Sign with Apple Pass Type ID cert
    ▼
binary HackUTA-2026.pkpass
```

The Apple private key stays on the certificate owner's machine or container. They never share their Apple ID or `.p12` with the rest of the team.

## 3. Local setup

Requires Node.js 22+.

```bash
cp .env.example .env
# Set WALLET_SERVICE_API_KEY (openssl rand -hex 32)
# Set APPLE_TEAM_IDENTIFIER and APPLE_PASS_TYPE_IDENTIFIER
npm install
npm run dev
```

Development starts **without** Apple PEMs so you can hit `/health` and validation/auth tests. `POST /passes/generate` then returns `503 signing_unavailable`. Production always requires valid certificate files and will refuse to boot without them. There is no fake-pass production mode.

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm start
```

## 4. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no (3000) | Listen port |
| `NODE_ENV` | production in deploy | `production` requires cert files |
| `WALLET_SERVICE_API_KEY` | yes, ≥ 32 chars | Shared Bearer secret |
| `APPLE_TEAM_IDENTIFIER` | yes | 10-character Team ID |
| `APPLE_PASS_TYPE_IDENTIFIER` | yes | `pass.com.example.id` |
| `APPLE_CERT_PATH` | production | Signer certificate PEM |
| `APPLE_KEY_PATH` | production | Signer private key PEM |
| `APPLE_KEY_PASSPHRASE` | if the key is encrypted | Key passphrase |
| `APPLE_WWDR_PATH` | production | Apple WWDR G4 PEM |
| `EVENT_NAME` | no | Default `HackUTA 2026` |
| `EVENT_LOCATION` | no | Default UT Arlington |
| `EVENT_START_DATE` | no | Default `2026-11-14T09:00:00-06:00` |
| `EVENT_END_DATE` | no | Default `2026-11-15T18:00:00-06:00` |
| `PASS_TEMPLATE_DIR` | no | Override template path |

Never put PEMs, passphrases, or the API key in HTTP responses, client bundles, or git.

## 5. Apple Developer account prerequisites

The account owner needs:

1. An [Apple Developer Program](https://developer.apple.com/programs/) membership.
2. A **Pass Type ID** identifier (e.g. `pass.com.hackuta.2026`).
3. A **Pass Type ID certificate** issued for that identifier.
4. The current **Apple Worldwide Developer Relations** intermediate (G4).

They do **not** need to share the Apple ID, App Store Connect access, or the raw `.p12` with HackUTA engineers. They host this repo and mount the PEMs.

## 6. Pass Type ID certificate setup

On a Mac signed into the developer account:

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → Identifiers → **+** → Pass Type IDs.
2. Description: `HackUTA 2026`. Identifier: `pass.com.hackuta.2026` (must match `APPLE_PASS_TYPE_IDENTIFIER`).
3. Certificates → **+** → **Pass Type ID Certificate** → select that identifier.
4. Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority (leave email, save to disk).
5. Upload the CSR, download the certificate, double-click to install.

## 7. Certificate and private key configuration

Export **without** emailing the `.p12` to anyone else. On the host that will run Docker:

```bash
# From Keychain: select the Pass Type ID cert → Export → .p12
openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out certs/signerCert.pem
openssl pkcs12 -in Certificates.p12 -nocerts -nodes -out certs/signerKey.pem
# If you want the key encrypted at rest, omit -nodes and set APPLE_KEY_PASSPHRASE.

# WWDR G4: https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform der -in AppleWWDRCAG4.cer -out certs/wwdr.pem
```

Set:

```
APPLE_CERT_PATH=/certs/signerCert.pem
APPLE_KEY_PATH=/certs/signerKey.pem
APPLE_WWDR_PATH=/certs/wwdr.pem
APPLE_TEAM_IDENTIFIER=XXXXXXXXXX
APPLE_PASS_TYPE_IDENTIFIER=pass.com.hackuta.2026
```

`pass.json` placeholders are overridden at signing time with these identifiers.

## 8. Docker deployment

```bash
cp .env.example .env
# fill secrets; put PEMs in ./certs (gitignored)
docker compose up --build
```

Certificates are bind-mounted read-only. They are **not** copied into the image. The container runs as a non-root user and exposes only port 3000.

## 9. HTTPS requirements

Put TLS in front of this process. Do not terminate production traffic with a self-signed certificate.

Typical setup: Caddy, nginx, or a cloud load balancer with a public certificate, forwarding to `127.0.0.1:3000`. Restrict ingress to the Convex/Vercel egress IPs if you can. CORS is intentionally **not** enabled.

## 10. API authentication

```
Authorization: Bearer <WALLET_SERVICE_API_KEY>
```

Missing, non-Bearer, and wrong keys all return `401` with the same body. Comparison uses SHA-256 + `timingSafeEqual`. Rotate by changing the env var on **both** this service and the HackUTA backend, then restart.

## 11. API request / response

### Health

```http
GET /health
```

```json
{ "status": "ok", "service": "hackuta-wallet-service" }
```

### Generate

```http
POST /passes/generate
Authorization: Bearer <WALLET_SERVICE_API_KEY>
Content-Type: application/json
```

```json
{
  "serialNumber": "hackuta-2026-jn7exampleid",
  "attendeeName": "Jane Q. Hacker",
  "qrToken": "<existing 64-char registration token from Convex>"
}
```

Success: binary `.pkpass`

```
Content-Type: application/vnd.apple.pkpass
Content-Disposition: attachment; filename="HackUTA-2026.pkpass"
Cache-Control: no-store
```

`serialNumber` must be the deterministic value from the participant record (`hackuta-2026-${participantId}` in profile). Do not generate a random serial per download.

JSON body limit is 16 KB. Field errors return `400` with field **names** only — the QR token is never echoed.

## 12. HackUTA Convex integration

Profile already has:

- `profile/appleWalletPassData:getMyAppleWalletPassInput` — session, accepted, not checked in, original QR, stable serial
- `AddToAppleWalletButton` — loading / error / download

Replace the **signing body** of `profile/appleWalletPass:generateMyAppleWalletPass` with a server-side `fetch` to this service. Copy [examples/convex-generate-pass-action.ts](examples/convex-generate-pass-action.ts). Set Convex env `WALLET_SERVICE_URL` and `WALLET_SERVICE_API_KEY`.

Do not trust browser-supplied names, IDs, or QR tokens.

## 13. Replacing the existing Wallet stub

1. Keep the button. It already calls a Convex action with **no arguments**.
2. Keep `getMyAppleWalletPassInput`. That is the eligibility gate.
3. In the Node action, POST `{ serialNumber, attendeeName, qrToken }` using the values from that query.
4. Return the same `{ ok, pkpassBase64, filename, serialNumber }` shape the button already understands (or a short-lived `passUrl`).
5. Remove local PEM signing from Convex once this service is the signer.

Vite has no secure server environment. Putting the API key in `VITE_*` would make the service public. That is why the browser only talks to Convex (or to a Vercel route that redeems a Convex ticket).

If Convex cannot return a binary file and you need a Vercel route, use the one-time ticket pattern in [examples/issuance-ticket-pattern.ts](examples/issuance-ticket-pattern.ts) and [examples/vercel-api-wallet.ts](examples/vercel-api-wallet.ts): 60s expiry, hashed storage, single redeem, eligibility re-check.

## 14. Testing on an iPhone

1. Deploy this service with **real** certs behind HTTPS.
2. Sign in to profile as an accepted, not-checked-in participant.
3. Tap **Add to Apple Wallet**.
4. iOS should offer Add to Wallet. If you see “Safari cannot download this file”, the MIME type or signature is wrong.
5. Confirm the QR in Wallet matches the on-screen registration QR (same token).
6. After physical badge check-in, the profile QR disappears. The installed pass is stale by design; volunteers scan the badge, not Wallet.

Android / desktop will download the file; only iOS/macOS Wallet installs it.

## 15. Troubleshooting invalid or unsigned passes

| Symptom | Likely cause |
| --- | --- |
| Pass will not install | Signing cert does not match `APPLE_PASS_TYPE_IDENTIFIER`, or WWDR is missing/old |
| “Invalid signature” | Exported the wrong key, or passphrase mismatch |
| QR not scannable | Backend sent a different token than `participants.qrCodeToken` |
| Service 503 | Dev mode without certs, or files not mounted |
| Service 401 | API key mismatch |
| Service 500 `signing_failed` | Template or cert problem; check **server** logs (no secrets in the HTTP body) |
| Health 200 but generate fails | Expected in development until PEMs are mounted |

Placeholder `templates/hackuta.pass/*.png` files are solid navy/gold art. Replace them with branded 72-dpi / @2x / @3x assets without changing filenames.

## 16. Credential rotation

1. Issue a new Pass Type ID certificate if the signer is compromised (this changes future signatures; already-installed passes keep the old cert until expiry).
2. Generate a new `WALLET_SERVICE_API_KEY`, set it on the wallet host **and** Convex/Vercel, restart both.
3. Revoke the old Pass Type ID certificate in the Apple developer portal if it leaked.
4. Never commit rotated PEMs.

## 17. Production checklist

- [ ] `WALLET_SERVICE_API_KEY` is unique, ≥ 32 characters, only on the signer and the HackUTA backend
- [ ] `APPLE_PASS_TYPE_IDENTIFIER` and `APPLE_TEAM_IDENTIFIER` match the issued certificate
- [ ] Signer cert, key, and WWDR G4 mounted read-only; not in the image
- [ ] `NODE_ENV=production`
- [ ] HTTPS reverse proxy; no public CORS
- [ ] Firewall limited to backend egress
- [ ] Health check passing
- [ ] One real pass installed on an iPhone before opening the button to all hackers
- [ ] Profile action still rejects checked-in participants
- [ ] Event dates/location env values reviewed

---

## For the Apple Developer account owner

You are hosting a small Node service so HackUTA can issue Wallet passes **without** receiving your Apple login or private key.

1. Create a Pass Type ID (suggested `pass.com.hackuta.2026`).
2. Issue a Pass Type ID certificate; export it and the private key as PEMs into `certs/` on **your** server (see §7).
3. Download Apple WWDR G4 and convert it to PEM.
4. Copy `.env.example` → `.env`. Fill Team ID, Pass Type ID, API key (HackUTA will put the same API key in Convex), event strings if you want to override dates/location.
5. `docker compose up --build`.
6. Put TLS in front (nginx/Caddy/load balancer). Give HackUTA only the HTTPS origin + the API key, never the PEMs.
7. Replace `templates/hackuta.pass` PNG files with branded art when you have it.

The API key is a shared secret with the HackUTA backend, not an Apple credential.

---

## Testing with real Apple credentials

Unit tests mock signing:

```bash
npm test
```

Live signing (produces a real zip `.pkpass`; still needs an iPhone to prove Wallet acceptance):

```bash
# .env fully populated, certs mounted
export WALLET_SERVICE_INTEGRATION=1
npm run test:integration
```

## Request examples

```bash
curl -sS http://127.0.0.1:3000/health

curl -sS -D - -o HackUTA-2026.pkpass \
  -H "Authorization: Bearer $WALLET_SERVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"serialNumber":"hackuta-2026-demo","attendeeName":"Jane Q. Hacker","qrToken":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' \
  http://127.0.0.1:3000/passes/generate
```
