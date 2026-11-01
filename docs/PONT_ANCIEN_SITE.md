# Pont ancien site → application

L'ancien site (Google Apps Script) envoie chaque inscription / paiement à la fonction Supabase `legacy-bridge`.
Les données arrivent « à traiter » dans **Inscriptions en ligne** et **Paiements en ligne** ; rien n'est créé automatiquement.

## Secrets (jamais dans le dépôt)
1. Supabase → Edge Functions → Secrets : créer `BRIDGE_SECRET` (longue valeur aléatoire, 40+ caractères).
2. Apps Script → Paramètres du projet → Propriétés du script : `BRIDGE_URL` = `https://lotzbcvzvgtsvszbigek.supabase.co/functions/v1/legacy-bridge` et `BRIDGE_SECRET` = la même valeur.
3. Déplacer aussi le jeton Telegram dans les Propriétés du script (et le régénérer via BotFather `/revoke`).

## Fonction à ajouter dans le script
```js
function envoyerVersApplication(donnees) {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty("BRIDGE_URL"), secret = props.getProperty("BRIDGE_SECRET");
    if (!url || !secret) return;
    UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json",
      headers: { "x-bridge-secret": secret },
      payload: JSON.stringify(donnees), muteHttpExceptions: true
    });
  } catch (e) { Logger.log("Pont application : " + e); } // ne bloque jamais l'inscription
}
```
## Appels
- Inscription (après l'enregistrement dans la feuille, à côté de `copierVersRegistrePublic(p)`) :
  `envoyerVersApplication({type:"inscription", nom:p.nom, sexe:p.sexe, dateNaissance:p.dateNaissance, lieuNaissance:p.lieuNaissance, province:p.province, secteur:p.secteur, adresse:p.adresse, pere:p.pere, mere:p.mere, classe:p.classe, option:p.option, telParent:p.telParent, ecole:p.ecole, numPermanent:p.numPermanent, date:p.date});`
- Paiement (après validation du paiement) :
  `envoyerVersApplication({type:"paiement", nomEleve:nom, montant:montant, motif:motif, date:date});`

## Modification dans Google Sheets → application (type « modification »)
La fonction `legacy-bridge` accepte aussi `type:"modification"` : elle retrouve l'élève par son **nom exact avant modification**
(`ancienNom`) ; si le nom est introuvable ou porté par deux élèves, elle refuse (409). Les champs reçus sont mis à jour
(en majuscules) et chaque changement est noté dans le journal d'audit (« Modification depuis Google Sheets »).
Les paiements ne passent jamais par ce chemin : un paiement modifié dans Sheets doit être déclaré (`type:"paiement"`) et vérifié.

Déclencheur Apps Script à installer (Déclencheurs → Ajouter → `surModificationFeuille` → « À la modification », feuille de calcul) :
```js
var COLONNES_SYNC = { 2:"nom", 3:"dateNaissance", 4:"lieuNaissance", 5:"province", 6:"secteur", 7:"adresse", 8:"pere", 9:"mere", 12:"telParent", 58:"sexe", 59:"ecole", 60:"numPermanent" };
function surModificationFeuille(e) {
  try {
    var r = e.range, sh = r.getSheet();
    if (sh.getIndex() !== 1 || r.getRow() < 2 || r.getNumRows() !== 1 || r.getNumColumns() !== 1) return;
    var champ = COLONNES_SYNC[r.getColumn()];
    if (!champ) return;
    var corps = { type: "modification" };
    corps[champ] = String(e.value || "");
    // ancien nom : si on modifie la colonne du nom, e.oldValue ; sinon le nom de la ligne
    corps.ancienNom = champ === "nom" ? String(e.oldValue || "") : String(sh.getRange(r.getRow(), 2).getValue());
    envoyerVersApplication(corps);
  } catch (err) { Logger.log("Synchro Sheets→application : " + err); }
}
```
