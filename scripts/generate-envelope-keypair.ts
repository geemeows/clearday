// One-shot helper for self-hosters. Generates the Ed25519 keypair used to
// sign OAuth result envelopes between the auth-proxy and the user Worker.
// Run once per deployment:
//   pnpm tsx scripts/generate-envelope-keypair.ts
// Set ENVELOPE_PRIVATE_KEY on the auth-proxy Worker, ENVELOPE_PUBLIC_KEY
// on the user Worker. Never commit the output.

import { generateEnvelopeKeypair } from "../src/shared/oauth/envelope";

const keys = await generateEnvelopeKeypair();
console.log("ENVELOPE_PUBLIC_KEY  =", keys.publicKey);
console.log("ENVELOPE_PRIVATE_KEY =", keys.privateKey);
