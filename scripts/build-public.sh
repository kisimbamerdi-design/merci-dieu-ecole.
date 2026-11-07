#!/bin/sh
# Construire un site statique à partir d'une liste fermée de fichiers publics.
# Ne jamais remplacer ce mécanisme par "publish = ." : le dépôt contient du SQL.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir dist
for fichier in index.html app.html connexion.html verifier.html confidentialite.html reglement.html config.js sw.js manifest.webmanifest version.json logo.png icon-192.png icon-512.png; do
  if [ ! -f "$fichier" ]; then echo "Fichier public manquant : $fichier" >&2; exit 1; fi
  cp -- "$fichier" "dist/$fichier"
done
# Illustrations publiques (SVG uniquement)
mkdir -p dist/img
for f in img/*.svg; do cp -- "$f" "dist/$f"; done
# Lien de confiance Android (application installée sans barre d'adresse) : contenu public
mkdir -p dist/.well-known
cp -- well-known/assetlinks.json dist/.well-known/assetlinks.json
