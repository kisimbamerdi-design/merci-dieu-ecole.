/**
 * Ancien site -> Smart School : relais EN LECTURE SOURCE uniquement.
 * Ajouter ce fichier au PROJET Apps Script existant, PAS au navigateur HTML.
 * Les secrets restent dans PropertiesService. Aucune clé n'est publiée.
 *
 * IMPORTANT : ne pas envoyer « modification » : modification directe
 * d'une fiche élève sans matricule vérifié = risque d'écrasement.
 * Envoyer seulement inscription / paiement, en mode « à traiter ».
 */
function envoyerVersApplication(donnees) {
  var type = String(donnees && donnees.type || "");
  if (type !== "inscription" && type !== "paiement") {
    Logger.log("Pont Smart School : type non pris en charge");
    return false;
  }
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("BRIDGE_URL");
  var secret = props.getProperty("BRIDGE_SECRET");
  if (!url || !secret || !/^https:\/\/lotzbcvzvgtsvszbigek\.supabase\.co\/functions\/v1\/legacy-bridge$/.test(url)) {
    Logger.log("Pont Smart School : configuration absente ou URL non autorisée");
    return false;
  }
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-bridge-secret": secret },
      payload: JSON.stringify(donnees),
      muteHttpExceptions: true,
      followRedirects: false
    });
    var status = response.getResponseCode();
    if (status !== 200) {
      // Ne jamais journaliser le corps (il peut contenir des données personnelles).
      Logger.log("Pont Smart School : erreur HTTP " + status + ", type " + type);
      return false;
    }
    var body;
    try { body = JSON.parse(response.getContentText()); }
    catch (e) { Logger.log("Pont Smart School : réponse non JSON"); return false; }
    if (!body || body.ok !== true) {
      Logger.log("Pont Smart School : accusé de réception absent");
      return false;
    }
    Logger.log("Pont Smart School : réception confirmée (" + type + ")");
    return true;
  } catch (e) {
    // Ne pas inclure le message brut (des informations de requête peuvent s'y trouver).
    Logger.log("Pont Smart School : envoi impossible (" + type + ")");
    return false;
  }
}
