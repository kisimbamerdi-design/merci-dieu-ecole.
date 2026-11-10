# Ancien site ↔ Merci-Dieu Smart School : intégration contrôlée

**ÉTAT : PRÉPARATION UNIQUEMENT — ni la fonction, ni le script Google n'ont été activés.**
École : Collège Merci Dieu, Kasumbalesa. Source historique : Google Apps Script + Google Sheets « Inscription du college merci Dieu ». Nouvelle application : Netlify + Supabase.

## Pourquoi ne pas synchroniser tout d'un coup ?

L'ancien système écrit des inscriptions dans `Feuille 1` et calcule ses paiements via Google Sheets, avec approbation Telegram. Supabase possède des tables distinctes : `online_registrations`, `students`, `payments`, `classes` et `fee_rates`. Importer directement les paiements ou élèves comme « validés » risque de créer des doublons et des attestations contradictoires.

La première phase est strictement **une direction, une entité, un état** :

`Ancien site -> Google Sheet (registre de référence) -> Apps Script (HMAC) -> Supabase Edge Function -> online_registrations (processed=false) -> validation manuelle par le comptable`.

**La phase 1 ne déplace pas les paiements, salaires, avances, reçus, journaux ou historiques.**
Les visiteurs restent sur l'ancien site pour s'inscrire tant que la bascule n'est pas terminée.

## Source vérifiée, sans import de données personnelles

Classeur Google : `Inscription du college merci Dieu`.
Onglet principal : `Feuille 1`, 76 colonnes actuellement prévues, en-têtes de A à BI :
- A date de l'inscription ; B nom complet ; C date de naissance ; D lieu ; E province ; F secteur ; G adresse ; H père ; I mère ; J classe ; K option ; L téléphone parent.
- M:BE : 15 groupes de dates/montants/statuts selon `MOTIF_COLONNES`.
- BF sexe ; BG ancienne école ; BH numéro permanent ; BI statut cas social.
- BJ (colonne 62) : en-tête vide lors de l'audit. L'ajout contrôlé de `MDSS_EVENT_ID` nécessite de REVÉRIFIER la colonne juste avant la pose.

Supabase `online_registrations` : `id uuid`, `payload jsonb`, `received_at`, `processed boolean`, `student_id uuid nullable`.
L'interface **Inscriptions en ligne** lit `payload.full_name`, `class_label` et `parent_phone` puis présente une vérification humaine.

## Code préparé

- `supabase/functions/legacy-registration-bridge/index.ts` : endpoint serveur-à-serveur qui n'accepte que des inscriptions signées HMAC-SHA256, horodatées (± 5 minutes), requête POST JSON, 24 Ko maximum ; crée uniquement une demande **non traitée** ; ne logue aucune identité. Ne jamais déployer sans secret configuré.
- `integrations/ancien-site/AppsScript_PONT_A_INSTALLER.gs` : fonction Apps Script à ajouter **manuellement dans le script officiel** après une copie de sauvegarde, puis à appeler APRÈS l'inscription Google Sheets.
- `integrations/ancien-site/proposition_index_dedoublonnage.sql` : index unique sur `payload.legacy_event_id`. À tester sur base locale, puis appliquer séparément après autorisation ; ce fichier n'est pas exécuté.
- `scripts/test-legacy-bridge.mjs` : tests automatisés hors production.

## Paramètres protégés (PAS DANS LE GITHUB)

1. Créer un secret aléatoire fort de 32 caractères minimum (non réutilisé ailleurs).
2. Dans Apps Script → Paramètres du projet → Propriétés du script, ajouter `MDSS_LEGACY_SYNC_SECRET` avec ce secret.
3. Dans Supabase → Edge Functions → Secrets, ajouter **exactement le même secret** sous `MDSS_LEGACY_SYNC_SECRET`.
4. Ne jamais écrire de jeton Telegram, clé `service_role`, secret de passerelle ou identifiants de parents dans un fichier GitHub public.
5. Installer la fonction Edge avec `verify_jwt=false` **uniquement** lorsqu'elle vérifie réellement la signature HMAC, et après test de l'index de dédoublonnage.
6. Les tests doivent confirmer : inscription rejetée sans signature, refus des rejouages, doublon ignoré, inscription reçue en « À traiter », erreur réseau réessayable depuis la même ligne BJ.

**Important** : le code partagé dans la conversation contient un jeton de bot Telegram apparemment actif. Le révoquer dans BotFather, puis placer le jeton de remplacement dans les Propriétés du script avant toute remise en service. Ne pas le recopier ici.

## Points bloquants de l'ancien code (à corriger avant une bascule)

- `doPost` accepte des objets JSON de webhook Telegram mais le code montré ne démontre pas l'authenticité de l'émetteur. Des appels falsifiés pourraient tenter une approbation. Le nouveau pont ne traite **aucune** validation Telegram.
- Les paiements de l'ancien système sont `EN ATTENTE` puis `APPROUVÉ`; Smart School utilise d'autres états. Ne pas rapprocher sur le seul nom de l'élève et ne jamais déclencher `confirme` à partir d'un paiement déclaré.
- L'ancien calcul inclut les 3 tranches d'État et juin dans 9 mensualités (septembre–mai), et a une règle spécifique pour les cas sociaux. Les tarifs actuels de Google Sheets et Supabase **diffèrent** : aucun écrasement automatique de `fee_rates`.
- L'ancien script `corrigerClesTarifs` utilise `sheet.clear()` et des valeurs de repli. Il ne faut PAS le relancer sur les données de production pour une connexion.
- La détection de doublon uniquement par le nom peut rejeter des homonymes ; les importations doivent être rapprochées par numéro permanent et ID d'événement.
- Certaines portions du code collé présentent des opérateurs manquants ou du code accolé, et ne sont pas une source exécutable fiable sans audit du projet Apps Script original.

## Procédure de vérification sans frais

1. Confirmer la source Apps Script **officielle** et créer une copie (sans modifier le script utilisé par les parents).
2. Révoquer le jeton Telegram divulgué et sécuriser les webhooks.
3. Exécuter `node --test scripts/test-legacy-bridge.mjs` et les tests de sécurité standard.
4. Tester l'index et le pont dans un environnement local/fictif, sans branch Supabase payante ni données personnelles.
5. Installer le pont dans Apps Script **après** l'enregistrement validé ; sauvegarder son ID d'événement en BJ avant de tenter la transmission.
6. Vérifier une demande fictive sans la traiter automatiquement. Simuler timeout, rejeu et doublon ; constater aucun paiement créé.
7. Une fois la phase 1 stabilisée : planifier séparément la migration historique et le rapprochement comptable (avec rapport des divergences avant écriture).

Les montants des tarifs, les preuves de paiement, les reçus, les règles « cas social » et les données d'élèves existants ne sont **pas modifiés** par cette proposition.
