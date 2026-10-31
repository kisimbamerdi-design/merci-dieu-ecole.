#!/bin/sh
# Construire un site statique à partir d'une liste fermée de fichiers publics.
# Ne jamais remplacer ce mécanisme par "publish = ." : le dépôt contient du SQL.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir dist
for fichier in index.html app.html connexion.html verifier.html confidentialite.html config.js sw.js manifest.webmanifest version.json logo.png; do
  if [ ! -f "$fichier" ]; then echo "Fichier public manquant : $fichier" >&2; exit 1; fi
  cp -- "$fichier" "dist/$fichier"
done
