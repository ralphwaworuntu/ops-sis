import { describe, expect, it } from 'vitest';
import { resolveUploadReadPath } from './upload-security';

describe('resolveUploadReadPath', () => {
	it('rejects traversal "../../../etc/passwd"', () => {
		const r = resolveUploadReadPath('../../../etc/passwd');
		expect(r.ok).toBe(false);
	});

	it('rejects traversal "folder/../../file.jpg"', () => {
		const r = resolveUploadReadPath('folder/../../file.jpg');
		expect(r.ok).toBe(false);
	});

	it('accepts "valid/sub/path/image.png"', () => {
		const r = resolveUploadReadPath('valid/sub/path/image.png');
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.ext).toBe('png');
			expect(r.absPath.toLowerCase()).toContain('uploads');
		}
	});
});

