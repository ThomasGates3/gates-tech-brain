/**
 * Secrets Vault
 * Local: reads from process.env (populated by .env.local — never committed).
 * Prod path: Vercel encrypted env vars OR AWS Secrets Manager fetched at startup.
 *   - Vercel: set the secret as an encrypted env var via `vercel env add`; it
 *     lands in process.env automatically (same key name).
 *   - AWS: call `new SecretsManagerClient().send(new GetSecretValueCommand({SecretId: vaultKey}))`
 *     at cold-start and cache; swap the `get()` impl below when deploying to AWS.
 *
 * NEVER log secret values. NEVER expose them to the client bundle.
 */

export interface Vault {
  /** Resolve a credential ref's vaultKey → the secret string. Throws if missing. */
  get(vaultKey: string): Promise<string>;
  /** Check existence without revealing the value. */
  has(vaultKey: string): Promise<boolean>;
}

const vault: Vault = {
  async get(vaultKey: string): Promise<string> {
    const value = process.env[vaultKey];
    if (!value) {
      throw new Error(`[vault] Missing secret for key: ${vaultKey}. Set it in .env.local (local) or Vercel/AWS Secrets Manager (prod).`);
    }
    // Value is returned to the caller (server-side only). Never log it.
    return value;
  },

  async has(vaultKey: string): Promise<boolean> {
    return Boolean(process.env[vaultKey]);
  },
};

export { vault };
export default vault;
