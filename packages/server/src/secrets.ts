/** Encrypts credential values with AES-256-GCM using a key derived from the server secret. */
export interface SecretBox {
	seal(value: unknown): Promise<string>;
	open(sealed: string): Promise<unknown>;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export async function createSecretBox(secret: string): Promise<SecretBox> {
	if (secret.length < 16) throw new Error('The server secret must be at least 16 characters.');
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
	const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);

	return {
		async seal(value) {
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const plain = new TextEncoder().encode(JSON.stringify(value));
			const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
			return `v1.${toBase64(iv)}.${toBase64(cipher)}`;
		},
		async open(sealed) {
			const [version, iv, cipher] = sealed.split('.');
			if (version !== 'v1' || !iv || !cipher) throw new Error('Unrecognized credential format.');
			try {
				const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(cipher));
				return JSON.parse(new TextDecoder().decode(plain));
			} catch {
				throw new Error('Could not decrypt the credential. Was the server secret changed?');
			}
		}
	};
}
