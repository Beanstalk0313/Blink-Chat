export const compressAndConvert = (file, size = 200, zoom = 1) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onerror = () => reject(reader.error || new Error('Could not read the image file.'));
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onerror = () => reject(new Error('Could not decode the image file.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing is unavailable in this browser.'));
          return;
        }
        
        const scale = Math.max(size / img.width, size / img.height) * zoom;
        const x = (size / 2) - (img.width / 2) * scale;
        const y = (size / 2) - (img.height / 2) * scale;
        
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    };
  });
};

export const getColor = (name) => {
  const colors = [
    '#FF5252', '#FF4081', '#E040FB', '#7C4DFF', 
    '#536DFE', '#448AFF', '#40C4FF', '#00BCD4', 
    '#009688', '#4CAF50', '#8BC34A', '#CDDC39', 
    '#FFC107', '#FF9800', '#FF5722'
  ];
  let hash = 0;
  for (let i = 0; i < (name?.length || 0); i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const mentionsUser = (text, displayName) => {
  const normalizedName = String(displayName || '').trim().toLowerCase();
  if (!normalizedName) return String(text || '').toLowerCase().includes('@everyone');
  const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9_])@${escapedName}(?=$|[^a-z0-9_])`, 'i').test(String(text || ''))
    || String(text || '').toLowerCase().includes('@everyone');
};

export const readStoredValue = (key, fallback = null) => {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

export const writeStoredValue = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeStoredValue = (key) => {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};
