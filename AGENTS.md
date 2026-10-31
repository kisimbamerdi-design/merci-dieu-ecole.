# Consignes pour les agents de code — Merci-Dieu Smart School

Ce fichier est lu automatiquement par Codex. Lis-le en entier avant de modifier quoi que ce soit.
Le document de passation complet (`PASSATION.md` : historique, état des lieux, failles, import, cahier des charges
des prochaines fonctions) est remis séparément et privément par la propriétaire. Il ne doit JAMAIS entrer dans ce dépôt.
Demande-le si tu ne l'as pas, et lis-le avant tout travail.

## Nature du projet

- Application de gestion d'un établissement scolaire (Collège Merci-Dieu, Kasumbalesa, RDC).
- Une seule page : `app.html` (HTML, CSS et JavaScript dans un seul fichier). Pas de build, pas de framework.
- Base de données et authentification : Supabase (PostgreSQL + RLS + Auth). Schéma : `schema.sql`.
- Hébergement : Netlify. Chaque envoi sur `main` déclenche un déploiement automatique.
- Langue de l'interface, des commentaires et des messages de commit : français.

## Règles impératives

1. **Ne modifie jamais la sécurité sans le signaler.** La sécurité réelle est dans les politiques RLS
   de Supabase (`schema.sql`). Les contrôles d'affichage (`MENU`, `can()`) sont cosmétiques : ils cachent,
   ils ne protègent pas. Toute nouvelle table ou fonction doit avoir des politiques RLS explicites.
2. **Ne mets jamais de clé `service_role`, de mot de passe ou de jeton dans le dépôt.** Seule la clé `anon`
   (publique par conception) figure dans `config.js`.
3. **Ne mets aucune donnée réelle d'élève, de parent, de membre du personnel ou de paiement dans le dépôt.**
   Le dépôt est publié en entier sur le web (`netlify.toml` : `publish = "."`).
4. **Ne renomme pas et ne supprime pas l'existant sans demande explicite.** Préfère une modification ciblée.
5. **Ne change pas les choix de design validés** (rôles, sections, format des reçus, ordre des champs)
   sans demande explicite de la propriétaire.
6. **Versions** : tout changement visible incrémente `APP_VERSION` dans `app.html` et le champ `version`
   de `version.json`, et met à jour `notes`. C'est ce qui alimente Paramètres → Mises à jour.
7. **Schéma** : toute modification de la base se fait dans `schema.sql` ET dans une migration Supabase.
   Les deux doivent rester identiques.
8. **Pas de procédure destructive** sur la base (suppression de tables, de politiques, de données)
   sans confirmation explicite.
9. **Commits** : messages courts en français, qui expliquent le « pourquoi ».

## Méthode de travail attendue

- Lis avant d'écrire. Vérifie chaque affirmation dans le code ou dans la base, ne la suppose pas.
- Pour une modification de `app.html`, recherche d'abord les occurrences (`grep`) et vérifie le nombre
  de remplacements avant d'appliquer.
- Vérifie le résultat : ouvre l'application en mode démonstration (sans `config.js` valide) et teste
  chaque rôle concerné.
- Ne fais pas de « refactoring » de confort sur du code qui fonctionne.

## Points d'attention actuels (détails dans PASSATION.md)

- Aucune donnée réelle n'est encore dans la base : n'écris rien en production sans confirmation explicite.
- Travaille sur une branche Supabase de développement, pas sur la production.
- `inscription.html` n'est volontairement PAS sur `main` : il vit sur la branche `inscription-publique-en-attente`. Ne le fusionne pas avant la protection anti-abus (fonction
  `submit_registration`, captcha, limitation de fréquence). `index.html` (page d'accueil) renvoie provisoirement vers l'ancien site.
- Version 2026.10.31.4 : modules Trésorerie, Circulaires, Documents/Archives/Bibliothèque, Agenda et Rapports élèves ajoutés (tables `treasury_entries`, `circulars`, `school_documents`, `agenda_events`, RLS en place). Les tuiles de l'écran Fonctionnalités sont dans le tableau `FONCTIONS` ; une tuile à `null` s'affiche « Bientôt ».
- Création de comptes : fonction serveur `manage-user` (supabase/functions/manage-user). Les identifiants de connexion sont de la forme `nom@merci-dieu.app`.
- Ne pas ajouter de bibliothèque non officielle pour WhatsApp (risque de blocage du numéro de l'école).
- Les secrets des fonctions serveur vivent uniquement dans les secrets Supabase.
