import { defineConfig } from 'drizzle-kit';
import { resolveSqlitePath } from './src/lib/server/paths';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url: resolveSqlitePath()
	}
});
