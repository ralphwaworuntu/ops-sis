declare global {
	namespace App {
		interface Locals {
			user: {
				id: number;
				username: string;
				nama: string;
				nrp: string;
				pangkat: string;
				role: 'POLSEK' | 'POLRES' | 'POLDA' | 'KARO OPS';
				unitId: number | null;
				unitNama: string | null;
				polresId: number | null;
				polresNama: string | null;
			} | null;
			sessionId: string | null;
		}
	}
}

export {};
