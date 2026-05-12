import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { resolveUploadReadPath } from '$lib/server/upload-security';

const MIME_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	pdf: 'application/pdf',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export const GET: RequestHandler = async ({ params }) => {
	const resolved = resolveUploadReadPath(params.path);
	if (!resolved.ok) {
		return new Response('Not found', { status: 404 });
	}
	const filepath = resolved.absPath;

	if (!existsSync(filepath)) {
		return new Response('Not found', { status: 404 });
	}

	const contentType = MIME_TYPES[resolved.ext] ?? 'application/octet-stream';

	const buffer = readFileSync(filepath);
	return new Response(buffer, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=86400'
		}
	});
};
