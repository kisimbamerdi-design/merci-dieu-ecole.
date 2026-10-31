# Sécurité sans frais — Collège Merci-Dieu

Ce dossier ne contient **aucune donnée d'élève, aucun jeton privé ni mot de passe**.

## Modifications disponibles

- Sur la branche `securite/zero-cout-20261031`, Netlify peut publier uniquement dix fichiers choisis dans `scripts/build-public.sh`. Le schéma SQL, les migrations, les rapports et les consignes restent hors du site web.
- La page `verifier.html` refuse les URL de démonstration `?d=`. Seul un jeton QR de 32 chiffres hexadécimaux est envoyé à Supabase pour vérification ; la page n'affiche plus les noms ni les montants.
- Changement volontaire du **nouveau** mot de passe : minimum 12 caractères dans l'interface. **Ce contrôle navigateur n'est pas une règle du serveur** : régler aussi la longueur minimale dans Supabase Auth.
- Les propositions SQL sous `supabase/security/` sont **non exécutées**. Leurs permissions ne sont pas encore appliquées.

## Tester gratuitement sur PC

Avec Git Bash, Git et Node.js 22, depuis un dossier de travail :

```sh
git clone https://github.com/kisimbamerdi-design/merci-dieu-ecole..git merci-dieu-smart-school
cd merci-dieu-smart-school
git switch securite/zero-cout-20261031
node --test scripts/test-security.mjs
sh scripts/build-public.sh
sh scripts/test-public.sh
```

Les mêmes tests tournent sur GitHub Actions, avec un runner standard gratuit pour le dépôt public. Ils n'ont besoin ni de mot de passe Supabase ni d'un environnement externe. **Ils ne prouvent pas la sécurité de la base PostgreSQL**.

## Étape PostgreSQL : à réaliser uniquement sur une copie LOCALE

1. Reproduire le schéma Supabase réel, avec les migrations récentes et les 21 tables. Le fichier `schema.sql` du dépôt peut être moins récent que la base : ne pas supposer qu'il suffit.
2. Créer des comptes et données de tests **fictifs** couvrant les rôles : anonyme, promoteur, direction, directeur des études, directeur de discipline, comptable-secrétaire et professeur.
3. Vérifier les accès autorisés **et refusés** aux classes, élèves, notes, présences, paiements, salaires, paramètres, messagerie et journal.
4. Tester d'abord `supabase/security/proposition_durcissement.sql`, puis `supabase/security/controle_permissions.sql` sur cette copie ; vérifier aussi la vraie API REST par rôle.
5. En particulier, tester que la consultation publique des classes, la demande d'inscription, la connexion, les reçus et le QR restent fonctionnels.
6. Mettre en place une fonction d'inscription avec validation serveur, anti-abus et quota avant de fermer l'ancienne insertion publique `online_registrations`.
7. Ne jamais appliquer le SQL à la base réelle sans test vert, sauvegarde et nouvelle autorisation explicite.

Le script de QR serveur `supabase/security/proposition_qr_prive.sql` est séparé : son application exige la validation du contrat de réponse de `verifier.html`.

## Protections gratuites dans Supabase Auth

L'organisation est sur **Free**. L'option intégrée de détection de mots de passe divulgués est réservée au plan Pro : **ne pas passer sur un plan payant** sans accord.
- Définir côté Supabase Auth une longueur minimale d'au moins 12 caractères pour les futurs mots de passe.
- Activer une MFA TOTP pour l'accès au **tableau de bord Supabase** des administrateurs. Pour imposer la MFA aux comptes de l'application, créer ensuite le parcours d'inscription/challenge et les contrôles RLS `aal2` : ce n'est PAS encore implémenté.
- Examiner l'inscription libre et les permissions d'administration avant de les modifier.
- Ne jamais partager la clé `service_role`, les codes de connexion ni des listes d'élèves dans les tickets GitHub.

## À ne pas faire

- Ne pas créer une branche Supabase payante.
- Ne pas importer les données réelles pour tester.
- Ne pas publier `schema.sql`, `AGENTS.md`, `PASSATION.md`, les migrations ou les documents privés.
- Ne pas fusionner la pull request brouillon avant le parcours de vérification sur un vrai téléphone et les tests RLS locaux.
