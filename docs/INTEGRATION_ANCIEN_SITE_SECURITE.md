# Ancien site → Merci-Dieu Smart School : intégration sécurisée

**État constaté le 1er novembre 2026 :** la fonction Supabase `legacy-bridge` (v2) est ACTIVE et le tableau de bord possède `online_registrations` et `online_payments`, mais les compteurs étaient tous les deux à **0**. Nous n'avons pas vérifié une transmission réelle depuis Apps Script et n'avons inscrit aucun élève ni paiement de test en production.

## Sens de synchronisation et responsabilité

**Google Sheets reste la source officielle des anciennes opérations** tant que la migration et le rapprochement financier ne sont pas validés. Les nouveaux envois arrivent dans Smart School en `À traiter`. Le comptable vérifie avant de créer/confirmer une écriture comptable. Ne **jamais** enregistrer automatiquement un versement réel comme `confirmé` en recevant une notification de l'ancien site.

Ne pas synchroniser par nom seul les dossiers d'élèves : des homonymes existent. La fonction `legacy-bridge` actuelle possède un chemin `type: modification` qui met à jour directement une fiche trouvée par nom ; **ne pas utiliser ce chemin**. Prévoir à la place un identifiant élève stable et une validation manuelle.

## Préparation dans Apps Script
1. Dans **BotFather**, révoquer **immédiatement** le jeton Telegram montré dans la conversation. Placer le nouveau jeton uniquement dans les propriétés du script : `TELEGRAM_BOT_TOKEN`. Corriger toutes les références en dur au jeton obsolète ; ne jamais le publier dans GitHub.
2. Dans Supabase, sous **Edge Functions → Secrets**, choisir une valeur forte pour `BRIDGE_SECRET` (ne jamais l'envoyer par chat).
3. Dans Apps Script, ouvrir **Paramètres du projet → Propriétés du script** et créer :
   - `BRIDGE_URL` : URL HTTPS de la fonction `legacy-bridge` associée au projet ;
   - `BRIDGE_SECRET` : exactement la même valeur secrète qu'à l'étape précédente.
4. Copier le contenu de [Bridge.gs](../integrations/ancien-site/Bridge.gs) dans un nouveau fichier `.gs` de l'Apps Script **existant**. **Ne pas créer un second `doPost(e)`**.
5. Dans le `handleInscription(p)` existant, après l'écriture **réellement réussie** de l'inscription dans la feuille, appeler `envoyerVersApplication({type:'inscription', nom:p.nom, classe:p.classe, option:p.option, sexe:p.sexe, dateNaissance:p.dateNaissance, lieuNaissance:p.lieuNaissance, province:p.province, secteur:p.secteur, adresse:p.adresse, pere:p.pere, mere:p.mere, telParent:p.telParent, ecole:p.ecole, numPermanent:p.numPermanent, date:p.date});`
6. Dans `handlePaiement(p)`, après que la demande initiale a été enregistrée dans les colonnes de paiement (pas après chaque redistribution interne), appeler **une seule fois** `envoyerVersApplication({type:'paiement', nomEleve:p.nomEleve, montant:p.montant, motif:p.motif, date:p.date});`. Si une demande est rejetée, ne rien transmettre.
7. Le résultat `false` indique un problème de transmission. L'ancienne opération **reste dans Sheets**. Rechercher les lignes manquantes avec le personnel avant d'envoyer à nouveau : le pont actuel **n'est pas idempotent** et un renvoi automatique crée des doublons.

## Précautions spécifiques au code fourni

- Les extraits `c === "7ÈME"  c === "8ÈME"` et `motif === "1ère tranche"  motif === "2ème tranche"` sont **syntaxiquement invalides si le code réel les contient tels quels** : vérifier que les opérateurs `||` n'ont pas été perdus lors du collage.
- Le code communiqué semble contenir des blocs `handleTelegramUpdate` dupliqués et des fragments de fonctions fusionnés : lancer une vérification syntaxique du projet **original** avant toute modification.
- Les callbacks Telegram utilisent le numéro de ligne de Sheets et un bot : vérifier les identifiants des deux approbateurs **côté serveur**, empêcher deux validations du même paiement, et vérifier que le numéro de ligne correspond toujours à la bonne inscription.
- Dans `getTarifValue`, prévoir un retour 0 avant `getRange(...,0,...)` si l'onglet est vide.
- Un paiement effectué avec un motif déjà soldé, un montant nul ou un parent homonyme ne doit jamais être confirmé automatiquement.
- Le calcul des frais d'État répartis sur septembre à mai dans Sheets n'est **pas identique** à la logique actuellement utilisée dans Smart School. **Ne pas recalculer les dettes en masse ni recopier les montants sans rapprochement.**
- L'onglet `Tarifs` réel de Sheets contient notamment NIVEAU_PRIMAIRE=15000 et NIVEAU_7_8=25000 ; Smart School contient d'autres montants de base (respectivement 20000 et 34000). Ne pas modifier les tarifs sans une validation de la direction.

## Tests avant activation

Exécuter localement `node --test integrations/ancien-site/Bridge.test.mjs`. Ensuite, dans Apps Script, vérifier la configuration, sauvegarder le projet et déployer une nouvelle **version** du web app uniquement après vérification par Claude / l'administrateur.

Pour la première livraison, utiliser des **fiches fictives** sur une copie d'essai du Google Sheet, et contrôler le nombre d'envois reçu dans Smart School ; si le script travaille avec la base de production, ne pas faire ces essais sans autorisation spécifique.

**À finaliser ensuite :** des identifiants d'événement uniques et des contraintes SQL d'idempotence, le rapprochement historique avec le registre de 61+ colonnes, et l'examen du webhook Telegram. Aucun de ces travaux n'est considéré terminé ni appliqué en production dans cette proposition.
