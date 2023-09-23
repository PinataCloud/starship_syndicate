import Crypto, { AES } from 'crypto-js/aes';

export const encrypt = (textToEncrypt) => {
  const ciphertext = AES.encrypt(textToEncrypt, process.env.ENCRYPTION_KEY).toString();
  return ciphertext;
}

export const decrypt = () => {
  const bytes  = AES.decrypt(ciphertext, process.env.ENCRYPTION_KEY);
  const originalText = bytes.toString(Crypto.enc.Utf8);
  return originalText;
}