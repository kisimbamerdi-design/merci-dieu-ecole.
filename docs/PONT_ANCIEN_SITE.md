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
