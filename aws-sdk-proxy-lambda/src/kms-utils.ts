import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';

let kmsClient: KMSClient | undefined;
const getKmsClient = (): KMSClient => (kmsClient ??= new KMSClient());

const decryptedCache: {[key: string]: string} = {};

export const decryptKmsEncrypted = async (encrypted: string): Promise<string> => {
  const cached = decryptedCache[encrypted];
  if (cached !== undefined) return cached;

  const kms = getKmsClient();
  const { Plaintext } = await kms.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(encrypted, 'base64')
  }));

  if (Plaintext === undefined) {
    throw new Error('Failed to decrypt KMS encrypted value');
  }

  const decrypted = Buffer.from(Plaintext).toString('utf-8');
  decryptedCache[encrypted] = decrypted;
  return decrypted;
}
