const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16;

let encryptionKey = null;

/**
 * Get or create encryption key
 * Key is stored in settings table or generated on first use
 * @param {Object} db - Database instance (optional, for persistent storage)
 * @returns {Buffer} 32-byte encryption key
 */
function getOrCreateEncryptionKey(db = null) {
  if (encryptionKey) {
    return encryptionKey;
  }

  if (db) {
    try {
      // Try to get existing key from settings
      const existingKey = db.getSetting('encryption_key', null);
      if (existingKey) {
        encryptionKey = Buffer.from(existingKey, 'hex');
        return encryptionKey;
      }
    } catch (error) {
      console.error('Error retrieving encryption key from settings:', error);
    }
  }

  // Generate new key
  encryptionKey = crypto.randomBytes(KEY_LENGTH);

  // Save to database if available
  if (db) {
    try {
      db.setSetting('encryption_key', encryptionKey.toString('hex'));
      db.saveDatabase();
    } catch (error) {
      console.error('Error saving encryption key to settings:', error);
    }
  }

  return encryptionKey;
}

/**
 * Encrypt text using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @param {Object} db - Database instance (optional)
 * @returns {string} Encrypted data in format: iv:authTag:encrypted
 */
function encrypt(text, db = null) {
  if (!text) {
    throw new Error('Cannot encrypt empty text');
  }

  const key = getOrCreateEncryptionKey(db);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return in format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt encrypted data
 * @param {string} encryptedData - Data in format: iv:authTag:encrypted
 * @param {Object} db - Database instance (optional)
 * @returns {string} Decrypted plain text
 */
function decrypt(encryptedData, db = null) {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }

  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format. Expected: iv:authTag:encrypted');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const key = getOrCreateEncryptionKey(db);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Reset encryption key (for testing or key rotation)
 * WARNING: This will make all existing encrypted data unreadable
 */
function resetEncryptionKey() {
  encryptionKey = null;
}

module.exports = {
  getOrCreateEncryptionKey,
  encrypt,
  decrypt,
  resetEncryptionKey
};
