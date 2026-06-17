const ID3_HEADER_BYTES = 10;
const MAX_TAG_BYTES = 16 * 1024 * 1024;

function bytesToString(bytes) {
  return String.fromCharCode(...bytes);
}

function readSynchsafe(bytes, offset) {
  return (
    (bytes[offset] << 21)
    | (bytes[offset + 1] << 14)
    | (bytes[offset + 2] << 7)
    | bytes[offset + 3]
  );
}

function readUint24(bytes, offset) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function readUint32(bytes, offset) {
  return (
    (bytes[offset] << 24)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
  ) >>> 0;
}

function removeUnsync(bytes) {
  const clean = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const current = bytes[index];
    const next = bytes[index + 1];
    clean.push(current);
    if (current === 0xff && next === 0x00) index += 1;
  }
  return new Uint8Array(clean);
}

function findTextTerminator(bytes, start, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index < bytes.length - 1; index += 2) {
      if (bytes[index] === 0 && bytes[index + 1] === 0) return index + 2;
    }
    return bytes.length;
  }

  const index = bytes.indexOf(0, start);
  return index === -1 ? bytes.length : index + 1;
}

function imageTypeFromMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('png')) return 'image/png';
  if (normalized.includes('webp')) return 'image/webp';
  if (normalized.includes('gif')) return 'image/gif';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'image/jpeg';
  return normalized.startsWith('image/') ? normalized : '';
}

function imageTypeFromBytes(bytes, fallback = '') {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (
    bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytesToString(bytes.slice(0, 4)) === 'RIFF' && bytesToString(bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  return fallback || 'image/jpeg';
}

function artworkFromApic(bytes) {
  if (bytes.length < 5) return null;

  const encoding = bytes[0];
  const mimeEnd = bytes.indexOf(0, 1);
  if (mimeEnd === -1) return null;

  const mime = bytesToString(bytes.slice(1, mimeEnd));
  const descriptionStart = mimeEnd + 2;
  const imageStart = findTextTerminator(bytes, descriptionStart, encoding);
  if (imageStart >= bytes.length) return null;

  const imageBytes = bytes.slice(imageStart);
  const type = imageTypeFromBytes(imageBytes, imageTypeFromMime(mime));
  return URL.createObjectURL(new Blob([imageBytes], { type }));
}

function artworkFromPic(bytes) {
  if (bytes.length < 6) return null;

  const encoding = bytes[0];
  const format = bytesToString(bytes.slice(1, 4)).toLowerCase();
  const mime = format.includes('png') ? 'image/png' : 'image/jpeg';
  const descriptionStart = 5;
  const imageStart = findTextTerminator(bytes, descriptionStart, encoding);
  if (imageStart >= bytes.length) return null;

  const imageBytes = bytes.slice(imageStart);
  return URL.createObjectURL(new Blob([imageBytes], {
    type: imageTypeFromBytes(imageBytes, mime),
  }));
}

function findArtworkInFrames(bytes, version, shouldRemoveUnsync) {
  let offset = 0;

  while (offset < bytes.length) {
    if (version === 2) {
      if (offset + 6 > bytes.length) return '';
      const frameId = bytesToString(bytes.slice(offset, offset + 3));
      const frameSize = readUint24(bytes, offset + 3);
      offset += 6;

      if (!frameId.trim() || frameSize <= 0 || offset + frameSize > bytes.length) return '';
      const rawFrame = bytes.slice(offset, offset + frameSize);
      const frame = shouldRemoveUnsync ? removeUnsync(rawFrame) : rawFrame;
      if (frameId === 'PIC') return artworkFromPic(frame) || '';
      offset += frameSize;
      continue;
    }

    if (offset + 10 > bytes.length) return '';
    const frameId = bytesToString(bytes.slice(offset, offset + 4));
    const frameSize = version === 4
      ? readSynchsafe(bytes, offset + 4)
      : readUint32(bytes, offset + 4);
    offset += 10;

    if (!frameId.trim() || frameSize <= 0 || offset + frameSize > bytes.length) return '';
    const rawFrame = bytes.slice(offset, offset + frameSize);
    const frame = shouldRemoveUnsync ? removeUnsync(rawFrame) : rawFrame;
    if (frameId === 'APIC') return artworkFromApic(frame) || '';
    offset += frameSize;
  }

  return '';
}

function skipExtendedHeader(bytes, version, flags) {
  if (!(flags & 0x40)) return 0;
  if (bytes.length < 4) return 0;

  const size = version === 4 ? readSynchsafe(bytes, 0) : readUint32(bytes, 0);
  return Math.min(bytes.length, version === 3 ? size + 4 : size);
}

export async function extractAudioArtworkUrl(file) {
  if (!file || typeof file.slice !== 'function') return '';

  const header = new Uint8Array(await file.slice(0, ID3_HEADER_BYTES).arrayBuffer());
  if (bytesToString(header.slice(0, 3)) !== 'ID3') return '';

  const version = header[3];
  if (![2, 3, 4].includes(version)) return '';

  const flags = header[5];
  const tagSize = readSynchsafe(header, 6);
  if (!tagSize) return '';

  const readSize = Math.min(tagSize, MAX_TAG_BYTES);
  const tag = new Uint8Array(await file.slice(ID3_HEADER_BYTES, ID3_HEADER_BYTES + readSize).arrayBuffer());
  const frameOffset = skipExtendedHeader(tag, version, flags);

  return findArtworkInFrames(tag.slice(frameOffset), version, Boolean(flags & 0x80));
}
