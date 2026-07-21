import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

export type GoogleTokenPayload = {
  refresh_token: string;
  access_token: string;
  expiry_date: number | null;
};

function getEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)",
    );
  }
  return key;
}

/** Encrypt a token payload to a base64url blob: iv.ciphertext.tag */
export function encryptTokens(payload: GoogleTokenPayload): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptTokens(blob: string): GoogleTokenPayload {
  const parts = blob.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token ciphertext format");
  }
  const [ivB64, ctB64, tagB64] = parts;
  const decipher = createDecipheriv(
    ALGO,
    getEncryptionKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as GoogleTokenPayload;
}
