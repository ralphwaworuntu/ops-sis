/** Cap waktu digital di pojok foto setelah kompresi (validitas bukti lapangan). */
export async function stampImageCornerTimestamp(file: File): Promise<File> {
	if (!file.type.startsWith('image/')) return file;
	const bmp = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	canvas.width = bmp.width;
	canvas.height = bmp.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bmp.close();
		return file;
	}
	ctx.drawImage(bmp, 0, 0);
	bmp.close();

	const t = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
	const fontPx = Math.max(12, Math.min(28, Math.floor(canvas.width / 35)));
	ctx.font = `600 ${fontPx}px ui-monospace, monospace`;
	const pad = Math.max(6, Math.floor(fontPx * 0.45));
	const tw = ctx.measureText(t).width;
	const boxH = fontPx + pad * 2;
	ctx.fillStyle = 'rgba(0,0,0,0.62)';
	ctx.fillRect(canvas.width - tw - pad * 2.5, canvas.height - boxH - pad, tw + pad * 2.5, boxH + pad * 0.5);
	ctx.fillStyle = '#ffffff';
	ctx.fillText(t, canvas.width - tw - pad * 1.25, canvas.height - pad * 1.35);

	const type = file.type.includes('png') ? 'image/png' : 'image/jpeg';
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('toBlob'))),
			type,
			type === 'image/png' ? undefined : 0.88
		);
	});
	const ext = type === 'image/png' ? '.png' : '.jpg';
	const base = file.name.replace(/\.[^.]+$/, '') || 'foto';
	return new File([blob], base + ext, { type });
}
