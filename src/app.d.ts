declare global {
	namespace App {
		interface Locals {
			user: {
				id: number;
				username: string;
				nama: string;
				nrp: string;
				pangkat: string;
				role:
					| 'KATIM PATROLI'
					| 'ADMIN POLSEK'
					| 'KAPOLSEK'
					| 'WAKAPOLSEK'
					| 'KANIT SAMAPTA'
					| 'KABAG OPS'
					| 'ADMIN POLRES'
					| 'KAPOLRES'
					| 'WAKAPOLRES'
					| 'POLDA'
					| 'KARO OPS';
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
