/**
 * PM2 — jalankan dari root repo setelah `npm run build`.
 *
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * instances: 1 — SSE broadcaster in-memory (jangan cluster tanpa Redis/pubsub).
 */
module.exports = {
	apps: [
		{
			name: 'ops-sis',
			script: 'build/index.js',
			cwd: __dirname + '/..',
			instances: 1,
			exec_mode: 'fork',
			autorestart: true,
			max_memory_restart: '512M',
			env: {
				NODE_ENV: 'production',
				HOST: '127.0.0.1',
				PORT: '3000',
				ORIGIN: 'https://sis.example.com',
				VITE_APP_URL: 'https://sis.example.com',
				DATABASE_URL: 'file:./data/ops-sis.db',
				UPLOAD_DIR: './uploads'
			}
		}
	]
};
