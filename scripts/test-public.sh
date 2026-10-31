#!/bin/sh
# Tests locaux gratuits : sh scripts/build-public.sh && sh scripts/test-public.sh
set -eu
cd "$(dirname "$0")/.."
test -d dist || { echo "Répertoire dist absent" >&2; exit 1; }
attendus='index.html app.html connexion.html verifier.html confidentialite.html reglement.html config.js sw.js manifest.webmanifest version.json logo.png'
for f in $attendus; do
  test -f "dist/$f" || { echo "Fichier public manquant dans dist : $f" >&2; exit 1; }
done
# Tout fichier additionnel fait échouer la publication : une erreur d'inclusion
# ne doit pas pouvoir exposer schema.sql, données privées ou migrations.
for f in dist/* dist/.[!.]*; do
  test -e "$f" || continue
  case "$(basename "$f")" in
    index.html|app.html|connexion.html|verifier.html|confidentialite.html|reglement.html|config.js|sw.js|manifest.webmanifest|version.json|logo.png) ;;
    *) echo "Publication refusée : fichier non autorisé $(basename "$f")" >&2; exit 1 ;;
  esac
done
test ! -e dist/schema.sql
test ! -e dist/AGENTS.md
test ! -e dist/supabase
test ! -e dist/PASSATION.md
if grep -qiE 'service_role|supabase_service_role|sb_secret_' dist/config.js; then
  echo "Clé Supabase privée ou référence suspecte dans config.js" >&2; exit 1
fi
echo "OK : seuls les 11 fichiers autorisés sont publiés"
