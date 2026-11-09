const fs = require('fs');
const path = require('path');

const MIME_EXTENSIONS = new Map([
  ['audio/mpeg', '.mp3'],
  ['audio/mp3', '.mp3'],
  ['audio/x-mp3', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/ogg', '.ogg'],
  ['audio/m4a', '.m4a'],
  ['audio/mp4', '.m4a']
]);
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function saveAudioUpload({ data }, uploadsDir) {
  if (typeof data !== 'string') return { status: 400, error: 'No se enviaron datos de archivo.' };
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(data);
  if (!match) return { status: 400, error: 'El archivo debe enviarse como Data URL base64.' };
  
  const mime = match[1].toLowerCase();
  const ext = MIME_EXTENSIONS.get(mime) || '.mp3';
  const encoded = match[2].replace(/\s/g, '');
  const buffer = Buffer.from(encoded, 'base64');

  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    return { status: 413, error: 'El archivo de audio está vacío o supera los 15MB.' };
  }

  fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `custom-alert-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return { filename, url: `/uploads/${filename}` };
}

module.exports = { saveAudioUpload };
