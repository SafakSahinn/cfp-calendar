// AES-256-GCM ile token şifreleme. Hem Deno (Edge Functions) hem Node (jobs) WebCrypto kullanır.
// TOKEN_ENC_KEY: 32 baytlık anahtarın base64 hali (üretmek için: `openssl rand -base64 32`).

const b64 = {
  encode(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  decode(text: string): Uint8Array<ArrayBuffer> {
    const s = atob(text);
    const out = new Uint8Array(new ArrayBuffer(s.length));
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(keyB64: string): Promise<CryptoKey> {
  let key = keyCache.get(keyB64);
  if (!key) {
    const raw = b64.decode(keyB64);
    if (raw.length !== 32) throw new Error('TOKEN_ENC_KEY 32 bayt (base64) olmalı');
    key = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    keyCache.set(keyB64, key);
  }
  return key;
}

export async function encrypt(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await importKey(keyB64),
    new TextEncoder().encode(plain),
  );
  return `${b64.encode(iv)}:${b64.encode(new Uint8Array(ct))}`;
}

export async function decrypt(packed: string, keyB64: string): Promise<string> {
  const [ivB64, ctB64] = packed.split(':');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64.decode(ivB64) },
    await importKey(keyB64),
    b64.decode(ctB64),
  );
  return new TextDecoder().decode(pt);
}
