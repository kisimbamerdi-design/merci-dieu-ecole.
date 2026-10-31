#!/bin/sh
set -eu
for f in index.html app.html connexion.html verifier.html confidentialite.html reglement.html config.js sw.js manifest.webmanifest version.json logo.png; do
  test -f "dist/$f" || { echo "Manque dans le site publié : $f" >&2; exit 1; }
done
for f in schema.sql AGENTS.md README.md netlify.toml PASSATION.md; do
  test ! -e "dist/$f" || { echo "Fichier interne publié par erreur : $f" >&2; exit 1; }
done
test ! -e dist/supabase || { echo "Migrations exposées" >&2; exit 1; }
test ! -e dist/scripts || { echo "Scripts internes exposés" >&2; exit 1; }
echo "Contrôle de publication réussi."
