# Finance POC-02 — Offline Passkey/PRF Secure Unlock

## Purpose

A stand-alone **experiment**, not a production security system. Checks whether a real iPhone Home Screen PWA can create a Passkey, obtain a stable cryptographic secret through WebAuthn PRF, encrypt a test note using AES-256-GCM, store **ciphertext only** in IndexedDB, and decrypt it again, including when offline.

No 6-digit application PIN is implemented. Face ID is **not guaranteed**: the operating system may use the device passcode or another credential provider. No server-side WebAuthn verification is performed; this PoC tests the PRF-based data-decryption property only.

## Important limitations

- NEVER enter actual account information, personal financial records or passwords.
- The experiment has no backup, credential recovery, device migration, PIN login, security review or production-grade threat model.
- A public GitHub Pages site exposes public JavaScript; GitHub Pages hosts app files only, while the test note is retained in local IndexedDB.
- A Passkey created here is scoped to its site/RP ID. Moving domains or deleting the Passkey may make the local encrypted note unrecoverable.
- POC-02 uses a separate storage namespace and repository from POC-01. **Never modify finance-poc-01.**
- Running in Safari rather than the installed Home Screen PWA may have different browser storage or credential behavior.
- If Passkey creation succeeds but subsequent PRF evaluation fails or is canceled, only **pending Passkey metadata** is saved (no plaintext and no encrypted note); an unused Passkey may remain in the iPhone Passwords app; remove only that explicitly named **Finance POC-02 (test)** entry yourself if desired.
- This PoC cannot prove that data cannot be extracted from a compromised device or maliciously updated app code. Local lock only protects the normal user interface session.

## Files

All files are standalone; **no npm, frameworks, external CDNs, OAuth or server-side code**.

- `index.html`, `styles.css` — test UI
- `app.js` — WebAuthn PRF registration and unlock flow
- `crypto.js` — HKDF -> AES-256-GCM encryption/decryption
- `db.js` — IndexedDB vault metadata and ciphertext
- `sw.js` — offline caching of only the static PWA shell
- `manifest.webmanifest`, `icons/`, `.nojekyll` — installable GitHub Pages PWA

## Hosting

Publish the *contents* of this archive to a **new** public repo `finance-poc-02` using GitHub Pages (`main`, `/(root)`). Expected address: `https://<github-user>.github.io/finance-poc-02/`.

HTTPS is required for WebAuthn. The RP ID/domain should remain unchanged after test credential enrollment.

## Real iPhone test plan

1. Open the HTTPS URL **in Safari**. Add to Home Screen and launch the installed app.
2. Wait until `Offline-кэш: Готов` and `IndexedDB: Работает`.
3. Enter a made-up note such as `Тест 11,75 BYN`.
4. Tap `Шаг 1 · Создать Passkey` and complete the system prompt. Then enter your made-up note and tap `Шаг 2 · Проверить PRF и зашифровать` (a **second, separate user action**).
5. If PRF returns unavailable, report `BLOCKED/UNSUPPORTED` with the message; do **not** call it PASS.
6. Tap `Разблокировать через Passkey`, authenticate, confirm the made-up note appears.
7. Tap `Заблокировать`, confirm the note disappears; authenticate again and confirm it returns.
8. Force close and reopen the Home Screen PWA; verify the note remains hidden until authenticated.
9. Enable Airplane Mode, disable Wi-Fi, force close and reopen; attempt unlock. Record PASS or FAIL.
10. While locked, tap unlock and **cancel** the system dialog; verify the note remains hidden. Record result.
11. Restart iPhone while offline and retest offline unlock.
12. Report whether the system used Face ID, device passcode or another method. That is OS-controlled.

Do not clear website data, remove the Passkey, or delete the PWA until tests complete. If a Passkey is accidentally deleted, the local encrypted test record may no longer be decryptable.

## Acceptance

- **Technical PASS:** encryption and IndexedDB persistence verified; a PRF output is obtained on the real iPhone; decryption works offline after reopening and restart; canceled authentication never reveals the test note.
- **FAIL:** a verified action unexpectedly loses/corrupts the test note or decrypts without necessary key material.
- **BLOCKED:** PRF, WebAuthn or offline Passkey use is unsupported by this device/configuration. Must record iOS version and exact message.
- **Out of scope:** secure PIN fallback, Vault export/recovery, penetration testing, production security certification.

## Suggested static checks

```sh
node --check app.js
node --check db.js
node --check crypto.js
node --check sw.js
python -m json.tool manifest.webmanifest
```

A desktop browser may not support the same PRF implementation as iOS Safari; only real-device results count for Face ID/offline PRF.

## Builder validation

Published test address: https://avahgard.github.io/finance-poc-02/.

`node --test tests/crypto.mjs` checks actual Web Crypto encryption, wrong-key rejection and tampering rejection. `tests/browser.cjs` checks actual desktop IndexedDB, Web Crypto and Service Worker behavior with **mocked WebAuthn only**. Use an already installed Playwright runner (`POC02_PLAYWRIGHT` can specify its module path) and browser (`POC02_BROWSER` can specify its executable); no app dependencies are needed or bundled. Set `POC02_URL` to run the same isolated fictional-data browser checks against the published site.

The builder fixed a reproduced lifecycle race: a late unlock completion could reveal the note after `pagehide` had locked the app. Unlock now verifies that no subsequent lock occurred and the document is visible before revealing decrypted data.

Desktop checks do not establish actual Passkey PRF availability, Face ID, iPhone storage persistence, or offline iPhone unlock. See `VALIDATION.md` for the bounded results. Follow the real iPhone plan above and record the iOS version, authentication method, exact errors, and each online/offline/cancellation result. PRF unavailable means BLOCKED/UNSUPPORTED.
