/**
 * LECTEUR EN LECTURE SEULE : Google Sheets (ancien site) -> Merci-Dieu Smart School
 *
 * Ce projet Apps Script est SÉPARÉ de votre script existant. Il ne modifie, n'efface et n'écrit RIEN
 * dans le classeur : sa permission est limitée à « spreadsheets.readonly » (voir appsscript.json),
 * donc même par erreur il ne peut pas écrire. Il ne touche pas non plus à Telegram.
 *
 * Il envoie à l'application, « à traiter », uniquement :
 *   - les NOUVELLES inscriptions de la Feuille 1 ;
 *   - les paiements lus dans la Feuille 1 (colonnes de l'ancien script : montant, statut EN ATTENTE ou APPROUVÉ, date).
 * Le comptable les vérifie dans l'application (Inscriptions en ligne / Paiements en ligne).
 *
 * Propriétés du script à créer (Paramètres du projet -> Propriétés du script) :
 *   SHEET_ID       identifiant du classeur (la partie entre /d/ et /edit dans son adresse)
 *   BRIDGE_URL     https://lotzbcvzvgtsvszbigek.supabase.co/functions/v1/legacy-bridge
 *   BRIDGE_SECRET  la même valeur que le secret BRIDGE_SECRET créé dans Supabase
 *
 * Mise en route : exécuter initialiser() UNE fois (note l'état actuel SANS rien envoyer),
 * puis installerDeclencheur(). Pour envoyer l'historique plus tard, uniquement sur ordre : envoyerTout().
 */

// Copie en lecture seule des colonnes de l'ancien script (1 = colonne A). Ne pas modifier sans changer l'ancien script.
var COLONNES_MOTIFS = {
  "Septembre": { date: 13, montant: 14, statut: 15 }, "Octobre": { date: 16, montant: 17, statut: 18 },
  "Novembre": { date: 19, montant: 20, statut: 21 }, "Décembre": { date: 22, montant: 23, statut: 24 },
  "Janvier": { date: 25, montant: 26, statut: 27 }, "Février": { date: 28, montant: 29, statut: 30 },
  "Mars": { date: 31, montant: 32, statut: 33 }, "Avril": { date: 34, montant: 35, statut: 36 },
  "Mai": { date: 37, montant: 38, statut: 39 }, "Juin": { date: 40, montant: 41, statut: 42 },
  "1ère tranche - Frais de l'État": { date: 43, montant: 44, statut: 45 },
  "2ème tranche - Frais de l'État": { date: 46, montant: 47, statut: 48 },
  "3ème tranche - Frais de l'État": { date: 49, montant: 50, statut: 51 },
  "Frais Technique": { date: 52, montant: 53, statut: 54 }, "Minervale": { date: 55, montant: 56, statut: 57 }
};
var MOTIF_APP = {
  "Septembre": "Frais mensuel — Septembre", "Octobre": "Frais mensuel — Octobre", "Novembre": "Frais mensuel — Novembre",
  "Décembre": "Frais mensuel — Décembre", "Janvier": "Frais mensuel — Janvier", "Février": "Frais mensuel — Février",
  "Mars": "Frais mensuel — Mars", "Avril": "Frais mensuel — Avril", "Mai": "Frais mensuel — Mai", "Juin": "Frais mensuel — Juin",
  "1ère tranche - Frais de l'État": "Frais de l'État — 1ère tranche", "2ème tranche - Frais de l'État": "Frais de l'État — 2e tranche",
  "3ème tranche - Frais de l'État": "Frais de l'État — 3e tranche", "Frais Technique": "Frais technique", "Minervale": "Minervale"
};
var MAX_PAR_PASSAGE = 80;

function config_() {
  var p = PropertiesService.getScriptProperties();
  var c = { id: p.getProperty("SHEET_ID"), url: p.getProperty("BRIDGE_URL"), secret: p.getProperty("BRIDGE_SECRET") };
  if (!c.id || !c.secret || !/^https:\/\/lotzbcvzvgtsvszbigek\.supabase\.co\/functions\/v1\/legacy-bridge$/.test(c.url || "")) {
    throw new Error("Configuration absente ou adresse non autorisée.");
  }
  return c;
}

function court_(texte) {
  var o = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texte, Utilities.Charset.UTF_8);
  return o.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("").slice(0, 12);
}
function norm_(v) { return String(v === null || v === undefined ? "" : v).trim().toUpperCase().replace(/\s+/g, " "); }
function txt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Africa/Lubumbashi", "dd/MM/yyyy");
  return String(v === null || v === undefined ? "" : v).trim();
}

// ---- mémoire des envois déjà faits (identifiants courts, découpés en blocs de 8000 caractères) ----
function lireEnvoyes_(cle) {
  var p = PropertiesService.getScriptProperties(), out = {}, i = 0, bloc;
  while ((bloc = p.getProperty("E_" + cle + "_" + i)) !== null) {
    bloc.split(",").forEach(function (x) { if (x) out[x] = 1; });
    i++;
  }
  return out;
}
function ecrireEnvoyes_(cle, set) {
  var p = PropertiesService.getScriptProperties(), ids = Object.keys(set), blocs = [], cur = "";
  ids.forEach(function (x) {
    if (cur.length + x.length + 1 > 8000) { blocs.push(cur); cur = ""; }
    cur += (cur ? "," : "") + x;
  });
  if (cur) blocs.push(cur);
  var i = 0;
  while (p.getProperty("E_" + cle + "_" + i) !== null) { p.deleteProperty("E_" + cle + "_" + i); i++; }
  blocs.forEach(function (b, k) { p.setProperty("E_" + cle + "_" + k, b); });
}

// ---- lecture (jamais d'écriture dans le classeur) ----
function evenements_(ss) {
  var ev = [], feuille1 = ss.getSheets()[0], n = feuille1.getLastRow();
  if (n >= 2) {
    var d = feuille1.getRange(2, 1, n - 1, 60).getValues();
    for (var i = 0; i < d.length; i++) {
      var nom = norm_(d[i][1]);
      if (nom.length < 3) continue;
      ev.push({
        cle: "INSCR",
        id: court_("I|" + nom + "|" + txt_(d[i][2]) + "|" + norm_(d[i][9]) + "|" + norm_(d[i][10])),
        corps: {
          type: "inscription", nom: nom, sexe: txt_(d[i][57]), dateNaissance: txt_(d[i][2]), lieuNaissance: txt_(d[i][3]),
          province: txt_(d[i][4]), secteur: txt_(d[i][5]), adresse: txt_(d[i][6]), pere: txt_(d[i][7]), mere: txt_(d[i][8]),
          classe: txt_(d[i][9]), option: txt_(d[i][10]), telParent: txt_(d[i][11]), ecole: txt_(d[i][58]),
          numPermanent: txt_(d[i][59]), date: txt_(d[i][0])
        }
      });
    }
  }
  // Paiements : lus dans la Feuille 1, colonnes réelles de l'ancien script (MOTIF_COLONNES : date, montant, statut)
  if (n >= 2) {
    var d2 = feuille1.getRange(2, 1, n - 1, 60).getValues();
    for (var r = 0; r < d2.length; r++) {
      var nomP = norm_(d2[r][1]);
      if (nomP.length < 3) continue;
      for (var motif in COLONNES_MOTIFS) {
        var cc = COLONNES_MOTIFS[motif];
        var montant = Number(d2[r][cc.montant - 1]) || 0;
        var statut = norm_(d2[r][cc.statut - 1]);
        if (montant <= 0 || (statut !== "EN ATTENTE" && statut !== "APPROUVÉ")) continue;
        var datep = txt_(d2[r][cc.date - 1]);
        ev.push({
          cle: "PAIE",
          id: court_("P|" + nomP + "|" + motif + "|" + montant + "|" + statut),
          corps: { type: "paiement", nomEleve: nomP, montant: montant, motif: MOTIF_APP[motif] + " (" + statut + ")", date: datep }
        });
      }
    }
  }
  return ev;
}

function initialiser() {
  var c = config_(), ss = SpreadsheetApp.openById(c.id), sets = { INSCR: {}, PAIE: {} };
  evenements_(ss).forEach(function (e) { sets[e.cle][e.id] = 1; });
  ecrireEnvoyes_("INSCR", sets.INSCR);
  ecrireEnvoyes_("PAIE", sets.PAIE);
  Logger.log("État actuel noté, RIEN envoyé : " + Object.keys(sets.INSCR).length + " inscriptions, " + Object.keys(sets.PAIE).length + " paiements.");
}

function envoyer_(c, liste) {
  var ok = [], reqs = liste.map(function (e) {
    var corps = {}; for (var k in e.corps) corps[k] = e.corps[k];
    corps.eventId = e.cle + "-" + e.id;
    return { url: c.url, method: "post", contentType: "application/json", headers: { "x-bridge-secret": c.secret },
             payload: JSON.stringify(corps), muteHttpExceptions: true, followRedirects: false };
  });
  var rep = UrlFetchApp.fetchAll(reqs);
  rep.forEach(function (r, i) {
    var bon = false;
    if (r.getResponseCode() === 200) { try { bon = JSON.parse(r.getContentText()).ok === true; } catch (e) {} }
    if (bon) ok.push(liste[i]); else Logger.log("Envoi refusé (HTTP " + r.getResponseCode() + ", " + liste[i].corps.type + ")");
  });
  return ok;
}

function passage_(toutEnvoyer) {
  var c = config_(), ss = SpreadsheetApp.openById(c.id);
  var sets = { INSCR: lireEnvoyes_("INSCR"), PAIE: lireEnvoyes_("PAIE") };
  var nouveaux = evenements_(ss).filter(function (e) { return !sets[e.cle][e.id]; });
  var total = nouveaux.length, envoyes = 0;
  while (nouveaux.length && (toutEnvoyer || envoyes < MAX_PAR_PASSAGE)) {
    var lot = nouveaux.splice(0, 20);
    envoyer_(c, lot).forEach(function (e) { sets[e.cle][e.id] = 1; envoyes++; });
  }
  ecrireEnvoyes_("INSCR", sets.INSCR);
  ecrireEnvoyes_("PAIE", sets.PAIE);
  Logger.log("Nouveautés : " + total + " | envoyées : " + envoyes);
}

function lireNouveautes() { passage_(false); }
function envoyerTout() { passage_(true); } // historique : à lancer uniquement sur ordre du promoteur

function installerDeclencheur() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "lireNouveautes") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("lireNouveautes").timeBased().everyMinutes(10).create();
  Logger.log("Lecture automatique toutes les 10 minutes activée.");
}
