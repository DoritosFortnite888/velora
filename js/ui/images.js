// Turns a picked picture into a small JPEG data URL, so it fits comfortably in IndexedDB.
export async function imageFileToDataURL(file, maxSide = 512) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Choose a picture file (JPEG, PNG or WebP).');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That picture could not be read. Try a JPEG or PNG.'));
      img.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // JPEG has no transparency, so fill the background first.
    ctx.fillStyle = '#1a1f2b';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
