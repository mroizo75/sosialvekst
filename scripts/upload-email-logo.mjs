import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const PUBLIC_BASE = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET || !PUBLIC_BASE) {
  console.error("Missing R2 env vars. Run with: node --env-file=.env.local scripts/upload-email-logo.mjs");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

const logoPath = resolve("public/logo.png");
const body = readFileSync(logoPath);
const key = "shared/email-logo.png";

await client.send(
  new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: "image/png",
    Body: body,
    CacheControl: "public, max-age=31536000, immutable",
  }),
);

const publicUrl = `${PUBLIC_BASE}/${key}`;
console.log(`Logo lastet opp til: ${publicUrl}`);
console.log("Bruk denne URL-en i Supabase e-postmaler.");
