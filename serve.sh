#!/usr/bin/env bash
# Démarre le serveur Laravel en forçant le répertoire temporaire PHP dans le projet.
# Corrige : "Unable to create temporary file, Check permissions in temporary files directory."
# Usage : ./serve.sh   ou   ./serve.sh --port=8080

cd "$(dirname "$0")"
TMP_DIR="$(pwd)/storage/app/upload_tmp"
mkdir -p "$TMP_DIR"
export TMPDIR="$TMP_DIR"
exec php -d upload_tmp_dir="$TMP_DIR" -d sys_temp_dir="$TMP_DIR" artisan serve "$@"
