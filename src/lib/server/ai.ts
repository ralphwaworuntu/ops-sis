import { env } from '$env/dynamic/private';

interface AiAnalysisInput {
	rengiatJudul: string;
	rengiatDeskripsi: string;
	jenisKejahatan: string;
	lokasi: string;
}

async function callOpenAI(prompt: string): Promise<string> {
	const { default: OpenAI } = await import('openai');
	const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
	const response = await client.chat.completions.create({
		model: 'gpt-4o-mini',
		messages: [
			{
				role: 'system',
				content:
					'Anda adalah AI auditor kepolisian yang menganalisis kesesuaian rencana kegiatan (Rengiat) dengan jenis kejahatan di titik rawan. Berikan analisis singkat dan saran perbaikan dalam Bahasa Indonesia.'
			},
			{ role: 'user', content: prompt }
		],
		max_tokens: 1000
	});
	return response.choices[0]?.message?.content ?? 'Tidak ada respons dari AI.';
}

async function callGemini(prompt: string): Promise<string> {
	const { GoogleGenerativeAI } = await import('@google/generative-ai');
	const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY ?? '');
	const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
	const result = await model.generateContent(
		`Anda adalah AI auditor kepolisian yang menganalisis kesesuaian rencana kegiatan (Rengiat) dengan jenis kejahatan di titik rawan. Berikan analisis singkat dan saran perbaikan dalam Bahasa Indonesia.\n\n${prompt}`
	);
	return result.response.text();
}

async function callAI(prompt: string): Promise<string> {
	const provider = env.AI_PROVIDER ?? 'openai';
	if (provider === 'gemini' && env.GEMINI_API_KEY) {
		return callGemini(prompt);
	}
	if (provider === 'openai' && env.OPENAI_API_KEY) {
		return callOpenAI(prompt);
	}
	return `[AI tidak dikonfigurasi — set AI_PROVIDER dan API key di .env]\n\nAnalisis placeholder: Rencana kegiatan perlu ditinjau lebih lanjut untuk memastikan kesesuaian dengan jenis kejahatan di lokasi target.`;
}

export async function analyzeRengiat(input: AiAnalysisInput): Promise<string> {
	const prompt = `Analisis Rencana Kegiatan (Rengiat):
Judul: ${input.rengiatJudul}
Deskripsi: ${input.rengiatDeskripsi}
Jenis Kejahatan di Lokasi: ${input.jenisKejahatan}
Lokasi: ${input.lokasi}

Pertanyaan:
1. Apakah rencana kegiatan ini sesuai dengan jenis kejahatan di lokasi tersebut?
2. Apa kekurangan dari rencana ini?
3. Apa saran perbaikan yang konkret?`;

	return callAI(prompt);
}

export async function generateTacticalPlan(input: AiAnalysisInput): Promise<string> {
	const prompt = `Buatkan 1 usulan rencana kegiatan taktis alternatif untuk menangani masalah berikut:

Jenis Kejahatan: ${input.jenisKejahatan}
Lokasi: ${input.lokasi}
Konteks Rengiat Sebelumnya: ${input.rengiatJudul} - ${input.rengiatDeskripsi}

Buatkan rencana taktis yang mencakup:
1. Tujuan operasi
2. Metode pelaksanaan
3. Jumlah dan komposisi personil
4. Jadwal pelaksanaan
5. Target capaian`;

	return callAI(prompt);
}
