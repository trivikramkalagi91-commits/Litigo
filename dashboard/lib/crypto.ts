/**
 * AES-256-GCM WebCrypto Encryption Helper for Litigo Local IndexedDB Storage
 * Encrypts sensitive PII and custom rule sets at rest (OWASP / GDPR compliant).
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

export async function deriveKey(secret: string = 'Litigo-AES256-SecretKey-2026'): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('litigo-salt-256'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data: string, secret?: string): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const key = await deriveKey(secret);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    enc.encode(data)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptData(ciphertext: string, iv: string, secret?: string): Promise<string> {
  const dec = new TextDecoder();
  const key = await deriveKey(secret);

  const ivArray = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const ciphertextArray = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv: ivArray },
    key,
    ciphertextArray
  );

  return dec.decode(decryptedBuffer);
}
