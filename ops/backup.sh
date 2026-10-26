#!/bin/bash
set -euo pipefail
umask 077
base=${COURRIER_BASE:-/workspace/gestion-courrier}
root="$base/backups/daily"
mkdir -p "$root"
exec 9>"$root/.backup.lock"
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
partial="$root/.pending-$stamp"
mkdir "$partial"
trap 'echo "Sauvegarde interrompue : $partial" >&2' ERR
# Local authenticated MariaDB socket. No database password in command arguments.
mariadb-dump --single-transaction --routines --triggers gestion_courrier | gzip > "$partial/database.sql.gz"
tar -czf "$partial/application.tar.gz" --exclude=backend/vendor --exclude=frontend/node_modules --exclude=backend/.git --exclude=frontend/.git -C "$base" backend frontend
(cd "$partial" && sha256sum database.sql.gz application.tar.gz > SHA256SUMS)
gzip -t "$partial/database.sql.gz"
tar -tzf "$partial/application.tar.gz" > /dev/null
mv "$partial" "$root/$stamp"
# Keep the newest seven completed backups. Never touch release/initial backups.
python3 - "$root" <<'PY'
import pathlib,re,shutil,sys
root=pathlib.Path(sys.argv[1])
backups=sorted(p for p in root.iterdir() if p.is_dir() and re.fullmatch(r'\d{8}T\d{6}Z',p.name))
for old in backups[:-7]: shutil.rmtree(old)
PY
printf 'Sauvegarde vérifiée : %s\n' "$root/$stamp"
