import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIME_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	pdf: 'application/pdf'
};

export const GET: RequestHandler = async ({ params }) => {
	const filepath = join('./uploads', params.path);

	if (!existsSync(filepath)) {
		return new Response('Not found', { status: 404 });
	}

	const ext = filepath.split('.').pop()?.toLowerCase() ?? '';
	const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

	const buffer = readFileSync(filepath);
	return new Response(buffer, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=86400'
		}
	});
};
