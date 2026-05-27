#!/usr/bin/env bash
#
# OPS-SIS — installer otomatis untuk Ubuntu 22.04 / 24.04 (VPS).
#
# Penggunaan interaktif:
#   sudo bash deploy/install.sh
#
# Non-interaktif (contoh):
#   sudo DOMAIN=sis.polri.go.id EMAIL=admin@polri.go.id \
#        APP_DIR=/var/www/ops-sis APP_USER=ops-sis \
#        bash deploy/install.sh --yes
#
# Deploy dari repo lokal (tanpa git clone):
#   sudo DOMAIN=sis.example.com bash deploy/install.sh --from-local --yes
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Konfigurasi (override via env) ---
APP_USER="${APP_USER:-ops-sis}"
APP_DIR="${APP_DIR:-/var/www/ops-sis}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PORT="${PORT:-3000}"
SKIP_SSL="${SKIP_SSL:-0}"
SKIP_SEED="${SKIP_SEED:-0}"
SKIP_NGINX="${SKIP_NGINX:-0}"
INSTALL_FROM_GIT="${INSTALL_FROM_GIT:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
FROM_LOCAL=0
ASSUME_YES=0

log() { printf '\033[1;34m[ops-sis]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ops-sis]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[ops-sis]\033[0m %s\n' "$*" >&2; }

usage() {
	cat <<'EOF'
OPS-SIS Ubuntu installer

Opsi:
  --from-local     Pakai sumber di folder repo saat ini (rsync ke APP_DIR)
  --yes            Non-interaktif (wajib set DOMAIN via env)
  --skip-ssl       Lewati Certbot (hanya HTTP / sertifikat manual)
  --skip-nginx     Lewati konfigurasi Nginx
  --skip-seed      Lewati npm run db:seed
  -h, --help       Bantuan

Variabel lingkungan:
  DOMAIN           Host publik (wajib), contoh: sis.example.com
  EMAIL            Email Let's Encrypt (opsional)
  APP_DIR          Direktori instalasi (default: /var/www/ops-sis)
  APP_USER         User sistem Linux (default: ops-sis)
  INSTALL_FROM_GIT URL git untuk clone (default: pakai --from-local)
  NODE_MAJOR       Versi Node major (default: 22)
  PORT             Port internal Node (default: 3000)
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--from-local) FROM_LOCAL=1 ;;
		--yes) ASSUME_YES=1 ;;
		--skip-ssl) SKIP_SSL=1 ;;
		--skip-nginx) SKIP_NGINX=1 ;;
		--skip-seed) SKIP_SEED=1 ;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			err "Argumen tidak dikenal: $1"
			usage
			exit 1
			;;
	esac
	shift
done

require_root() {
	if [[ "$(id -u)" -ne 0 ]]; then
		err "Jalankan dengan sudo: sudo bash deploy/install.sh"
		exit 1
	fi
}

prompt_if_needed() {
	if [[ -n "$DOMAIN" ]]; then
		return
	fi
	if [[ "$ASSUME_YES" -eq 1 ]]; then
		err "DOMAIN wajib di-set saat --yes (contoh: DOMAIN=sis.example.com)"
		exit 1
	fi
	read -r -p "Domain publik (contoh: sis.example.com): " DOMAIN
	if [[ -z "$DOMAIN" ]]; then
		err "DOMAIN tidak boleh kosong."
		exit 1
	fi
}

install_apt_packages() {
	log "Memasang paket sistem..."
	export DEBIAN_FRONTEND=noninteractive
	apt-get update -qq
	apt-get install -y -qq \
		curl \
		ca-certificates \
		gnupg \
		nginx \
		rsync \
		build-essential \
		python3 \
		git \
		ufw \
		certbot \
		python3-certbot-nginx
}

install_node() {
	if command -v node >/dev/null 2>&1; then
		local ver
		ver="$(node -v | sed 's/v//' | cut -d. -f1)"
		if [[ "$ver" -ge "$NODE_MAJOR" ]]; then
			log "Node sudah terpasang: $(node -v)"
			return
		fi
		warn "Node $(node -v) lebih rendah dari ${NODE_MAJOR}.x — memasang ulang..."
	fi

	log "Memasang Node.js ${NODE_MAJOR}.x (NodeSource)..."
	curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
	apt-get install -y -qq nodejs
	log "Node: $(node -v) | npm: $(npm -v)"
}

install_pm2() {
	if command -v pm2 >/dev/null 2>&1; then
		log "PM2 sudah terpasang: $(pm2 -v)"
		return
	fi
	log "Memasang PM2 global..."
	npm install -g pm2
}

ensure_app_user() {
	if ! id "$APP_USER" &>/dev/null; then
		log "Membuat user sistem: $APP_USER"
		useradd --system --home-dir "$APP_DIR" --create-home --shell /usr/sbin/nologin "$APP_USER" || true
	fi
	mkdir -p "$APP_DIR"
	chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

sync_application() {
	if [[ "$FROM_LOCAL" -eq 1 ]] || [[ -z "$INSTALL_FROM_GIT" ]]; then
		if [[ ! -f "$REPO_ROOT/package.json" ]]; then
			err "package.json tidak ditemukan di $REPO_ROOT"
			exit 1
		fi
		log "Menyalin aplikasi dari $REPO_ROOT → $APP_DIR"
		rsync -a --delete \
			--exclude node_modules \
			--exclude .svelte-kit \
			--exclude build \
			--exclude data \
			--exclude uploads \
			--exclude .env \
			--exclude .env.production \
			"$REPO_ROOT/" "$APP_DIR/"
	else
		if [[ -d "$APP_DIR/.git" ]]; then
			log "Git pull di $APP_DIR"
			sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
			sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$GIT_BRANCH"
			sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only origin "$GIT_BRANCH"
		else
			log "Clone $INSTALL_FROM_GIT → $APP_DIR"
			sudo -u "$APP_USER" git clone --branch "$GIT_BRANCH" --depth 1 "$INSTALL_FROM_GIT" "$APP_DIR"
		fi
	fi
	chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

write_env_production() {
	local env_file="$APP_DIR/.env.production"
	local origin="https://${DOMAIN}"

	log "Menulis $env_file"
	cat >"$env_file" <<EOF
NODE_ENV=production
ORIGIN=${origin}
VITE_APP_URL=${origin}

HOST=127.0.0.1
PORT=${PORT}

DATABASE_URL=file:./data/ops-sis.db
UPLOAD_DIR=./uploads
STORAGE_PROVIDER=local

AI_PROVIDER=openai
OPENAI_API_KEY=
GEMINI_API_KEY=
EOF
	chown "$APP_USER:$APP_USER" "$env_file"
	chmod 600 "$env_file"
	warn "Edit API key AI jika diperlukan: sudo -u $APP_USER nano $env_file"
}

build_application() {
	log "npm ci (sebagai $APP_USER)..."
	sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm ci"

	mkdir -p "$APP_DIR/data" "$APP_DIR/uploads"
	chown -R "$APP_USER:$APP_USER" "$APP_DIR/data" "$APP_DIR/uploads"

	if [[ "$SKIP_SEED" -eq 0 ]]; then
		log "Seed database (demo) — lewati di production dengan SKIP_SEED=1"
		sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run db:seed" || warn "Seed dilewati atau DB sudah ada."
	fi

	log "Build production (memuat .env.production)..."
	sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && set -a && source .env.production && set +a && npm run build"
}

start_pm2() {
	log "Memulai / memperbarui PM2..."
	local pm2_env="deploy/ecosystem.config.cjs"
	# Patch origin di ecosystem via env saat start
	sudo -u "$APP_USER" bash -lc "
		cd '$APP_DIR' &&
		export ORIGIN='https://${DOMAIN}' &&
		export VITE_APP_URL='https://${DOMAIN}' &&
		export PORT='${PORT}' &&
		pm2 delete ops-sis 2>/dev/null || true &&
		pm2 start $pm2_env &&
		pm2 save
	"
	env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" >/dev/null 2>&1 || true
}

configure_nginx() {
	if [[ "$SKIP_NGINX" -eq 1 ]]; then
		warn "Nginx dilewati (--skip-nginx)"
		return
	fi

	local site="ops-sis"
	local avail="/etc/nginx/sites-available/${site}"
	local enabled="/etc/nginx/sites-enabled/${site}"
	local tmpl="$APP_DIR/deploy/nginx-ops-sis.conf.example"

	log "Konfigurasi Nginx untuk $DOMAIN..."

	if [[ "$SKIP_SSL" -eq 1 ]] || [[ -z "$EMAIL" ]] || [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
		warn "Mode HTTP (port 80) — Certbot akan menambah HTTPS jika EMAIL di-set."
		cat >"$avail" <<NGX
upstream ops_sis {
	server 127.0.0.1:${PORT};
	keepalive 32;
}

server {
	listen 80;
	server_name ${DOMAIN};
	client_max_body_size 25M;

	location / {
		proxy_pass http://ops_sis;
		proxy_http_version 1.1;
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
	}

	location /api/events {
		proxy_pass http://ops_sis;
		proxy_http_version 1.1;
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_set_header Connection '';
		proxy_buffering off;
		proxy_cache off;
		proxy_read_timeout 86400s;
		chunked_transfer_encoding off;
	}
}
NGX
	else
		sed -e "s/sis\\.example\\.com/${DOMAIN}/g" \
			-e "s/127\\.0\\.0\\.1:3000/127.0.0.1:${PORT}/g" \
			"$tmpl" >"$avail"
	fi

	ln -sf "$avail" "$enabled"
	rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
	nginx -t
	systemctl enable nginx
	systemctl reload nginx
}

setup_ssl() {
	if [[ "$SKIP_SSL" -eq 1 ]] || [[ -z "$EMAIL" ]]; then
		warn "Certbot dilewati. Set EMAIL=... untuk HTTPS otomatis."
		return
	fi
	log "Memasang sertifikat Let's Encrypt..."
	certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect || {
		warn "Certbot gagal — periksa DNS A record mengarah ke server ini."
	}
}

configure_firewall() {
	if ! command -v ufw >/dev/null 2>&1; then
		return
	fi
	if ufw status | grep -q inactive; then
		log "Mengaktifkan UFW (OpenSSH, Nginx)..."
		ufw allow OpenSSH
		ufw allow 'Nginx Full'
		ufw --force enable || true
	fi
}

print_summary() {
	cat <<EOF

================================================================================
  OPS-SIS berhasil diinstal
================================================================================
  URL       : https://${DOMAIN}  (atau http jika SSL belum aktif)
  App dir   : ${APP_DIR}
  User      : ${APP_USER}
  PM2       : pm2 status -u ${APP_USER}  (atau: sudo -u ${APP_USER} pm2 status)
  Logs      : sudo -u ${APP_USER} pm2 logs ops-sis
  Env       : ${APP_DIR}/.env.production
  DB        : ${APP_DIR}/data/ops-sis.db
  Uploads   : ${APP_DIR}/uploads/

  Langkah berikutnya:
  1. Edit API key: sudo -u ${APP_USER} nano ${APP_DIR}/.env.production
     Lalu: sudo -u ${APP_USER} bash -lc 'cd ${APP_DIR} && npm run build && pm2 restart ops-sis'
  2. Ganti password demo — lihat demo-credentials.md (jangan dipakai di prod)
  3. Backup harian: data/ dan uploads/
  4. Dokumentasi lengkap: docs/DEPLOYMENT.md

================================================================================
EOF
}

main() {
	require_root
	prompt_if_needed
	install_apt_packages
	install_node
	install_pm2
	ensure_app_user
	sync_application
	write_env_production
	build_application
	start_pm2
	configure_nginx
	setup_ssl
	configure_firewall
	print_summary
}

main "$@"
