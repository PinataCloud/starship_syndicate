import Crypto from 'crypto-js';

export const encrypt = (textToEncrypt) => {
  const ciphertext = Crypto.AES.encrypt(textToEncrypt, process.env.ENCRYPTION_SECRET).toString();
  return ciphertext;
}

export const decrypt = () => {
  const bytes  = Crypto.AES.decrypt(ciphertext, process.env.ENCRYPTION_SECRET);
  const originalText = bytes.toString(Crypto.enc.Utf8);
  return originalText;
}