import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Narrow server-side credential boundary for email provider OAuth tokens.
 * Ciphertext may be persisted; plaintext tokens never leave this module to the UI/audit log.
 */

const ALGO = "aes-256-gcm";

function getEncryptionKey(): Buffer | null {
  const secret = process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

export function isCredentialEncryptionConfigured(): boolean {
  return Boolean(getEncryptionKey());
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "EMAIL_CREDENTIALS_ENCRYPTION_KEY is required to store email provider credentials securely.",
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error("EMAIL_CREDENTIALS_ENCRYPTION_KEY is required to read email provider credentials.");
  }
  const [version, ivPart, tagPart, dataPart] = ciphertext.split(":");
  if (version !== "v1" || !ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid credential ciphertext format.");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function getGmailOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}
