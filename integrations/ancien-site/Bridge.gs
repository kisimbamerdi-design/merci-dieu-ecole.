/**
 * Ancien site -> Smart School : relais (inscription et paiement seulement, « à traiter »).
 * À ajouter comme NOUVEAU FICHIER .gs dans le projet Apps Script existant. Ne créer aucun second doPost.
 * Secrets (BRIDGE_URL, BRIDGE_SECRET) : uniquement dans Propriétés du script.
 * Base : relais de Codex (PR n° 5), complété d'un identifiant d'événement anti-doublon (eventId).
 */
function eventIdPour_(donnees) {
  var brut = [donnees.type, donnees.nom || donnees.nomEleve, donnees.montant, donnees.motif, donnees.date, donnees.classe].join("|");
  var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, brut, Utilities.Charset.UTF_8);
  return octets.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("").slice(0, 40);
}

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
    var corps = {};
    for (var k in donnees) corps[k] = donnees[k];
    if (!corps.eventId) corps.eventId = eventIdPour_(donnees);
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-bridge-secret": secret },
      payload: JSON.stringify(corps),
      muteHttpExceptions: true,
      followRedirects: false
    });
    var status = response.getResponseCode();
    if (status !== 200) {
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
    Logger.log("Pont Smart School : réception confirmée (" + type + (body.duplicate ? ", déjà reçu" : "") + ")");
    return true;
  } catch (e) {
    Logger.log("Pont Smart School : envoi impossible (" + type + ")");
    return false;
  }
}
