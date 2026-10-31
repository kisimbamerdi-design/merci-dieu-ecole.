#!/bin/sh
# Ne publier que les fichiers nécessaires : aucune migration ni donnée privée.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
for f in index.html app.html connexion.html verifier.html confidentialite.html config.js sw.js manifest.webmanifest version.json logo.png; do
  test -f "$f" || { echo "Fichier absent : $f" >&2; exit 1; }
  cp "$f" "dist/$f"
done
