# Signing certificates

Put PEM files here. They are gitignored except this README.

Required names (Docker Compose mounts this folder at `/certs`):

| File | Contents |
| --- | --- |
| `signerCert.pem` | Pass Type ID certificate |
| `signerKey.pem` | Matching private key |
| `wwdr.pem` | Apple WWDR G4 intermediate |

```bash
openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out certs/signerCert.pem
openssl pkcs12 -in Certificates.p12 -nocerts -nodes -out certs/signerKey.pem
openssl x509 -inform der -in AppleWWDRCAG4.cer -out certs/wwdr.pem
chmod 644 certs/*.pem
```

WWDR G4: https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer

Never email the `.p12` in an open channel if you can copy PEMs onto the host directly. Full steps: [SETUP.md](../SETUP.md).
