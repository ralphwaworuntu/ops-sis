import imageCompression from 'browser-image-compression';

/** Kompresi sebelum upload — target &lt; 500KB untuk jaringan lemah (NTT). */
export async function compressImageFileIfNeeded(file: File, maxSizeMB = 0.48): Promise<File> {
	if (!file?.size || !file.type.startsWith('image/')) return file;
	try {
		return await imageCompression(file, {
			maxSizeMB,
			maxWidthOrHeight: 1920,
			useWebWorker: true,
			initialQuality: 0.85,
			fileType: file.type.includes('png') ? 'image/png' : 'image/jpeg'
		});
	} catch {
		return file;
	}
}
