export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const data = await response.json();
    // tmpfiles.org returns data.data.url for the direct link or similar
    // Note: The API docs say it returns a JSON with the URL.
    return {
      url: data.data.url,
      name: file.name,
      size: file.size,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    };
  } catch (error) {
    console.error('File upload error:', error);
    throw error;
  }
}
