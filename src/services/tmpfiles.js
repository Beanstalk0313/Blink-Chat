export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    
    if (data.status === 'success') {
      // The API returns https://tmpfiles.org/api/v1/dl/12345/image.png
      // To get the direct image we change dl to dl/ (actually the API docs say we just use it, but tmpfiles.org uses a download page unless it's direct. We will use the URL provided)
      // Actually we need to insert dl before the file id for direct download link usually, but let's see.
      // Let's replace tmpfiles.org/ with tmpfiles.org/dl/ for direct file link if it's not already.
      const url = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      return url;
    } else {
      throw new Error('Upload failed');
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}
