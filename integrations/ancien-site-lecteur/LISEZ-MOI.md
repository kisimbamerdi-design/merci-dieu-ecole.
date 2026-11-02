# Lecteur de l'ancien classeur (lecture seule)

Ne modifie ni votre script existant, ni le classeur Google Sheets, ni Telegram. Permission limitée à la lecture (`spreadsheets.readonly`).

## Installation (10 minutes, une seule fois)
1. Sur script.google.com : **Nouveau projet** (pas votre script existant). Nommez-le « Lecteur Merci-Dieu ».
2. Remplacez le contenu de `Code.gs` par `Lecteur.gs`.
3. Paramètres du projet → cochez « Afficher le fichier manifeste appsscript.json » → remplacez son contenu par celui du fichier `appsscript.json` fourni.
4. Paramètres du projet → Propriétés du script → ajoutez :
   - `SHEET_ID` : identifiant du classeur (la partie entre `/d/` et `/edit` dans son adresse) ;
   - `BRIDGE_URL` : `https://lotzbcvzvgtsvszbigek.supabase.co/functions/v1/legacy-bridge` ;
   - `BRIDGE_SECRET` : même valeur que le secret `BRIDGE_SECRET` créé dans Supabase (Edge Functions → Secrets).
5. Exécutez **initialiser** (autorisez l'accès en lecture au classeur) : il note l'état actuel, **sans rien envoyer**.
6. Exécutez **installerDeclencheur** : lecture automatique toutes les 10 minutes.

## Ensuite
- Chaque nouvelle inscription ou chaque paiement apparu dans les onglets « Paiements - <mois> » arrive dans l'application, « à traiter » (Inscriptions en ligne / Paiements en ligne).
- L'historique n'est PAS envoyé. Pour l'envoyer, uniquement sur ordre : exécuter **envoyerTout** (à faire avec le plan d'import, pas avant).
- Un montant corrigé dans un onglet de paiement arrive comme une nouvelle déclaration (le comptable voit les deux et garde la bonne).
- Les paiements en attente, rejetés ou annulés (colonne Statut) ne sont pas envoyés.
