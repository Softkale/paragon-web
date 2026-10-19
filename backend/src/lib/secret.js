const crypto = require('crypto');

// Cifrado simétrico (AES-256-GCM) para guardar secretos en la base, como la contraseña del SMTP.
// La clave sale de JWT_SECRET: si ese valor cambia, los secretos guardados dejan de poder leerse
// y hay que volver a escribirlos.
const key = () => crypto.scryptSync(process.env.JWT_SECRET || '', 'paragon-settings-v1', 32);

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['enc', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

// Devuelve el texto original, o null si no se puede descifrar.
function decrypt(stored) {
  try {
    const [tag, iv, auth, data] = String(stored).split(':');
    if (tag !== 'enc') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(auth, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
