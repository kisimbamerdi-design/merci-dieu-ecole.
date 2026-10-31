/**
 * Pont facultatif de l'ANCIEN Apps Script vers Smart School.
 * A COPIER uniquement dans la source officielle d'Apps Script après sauvegarde.
 * NE PAS coller de secret dans le fichier. Configurez Script Properties:
 * MDSS_LEGACY_SYNC_SECRET = secret aléatoire commun (>= 32 caractères).
 *
 * Après avoir enregistré une inscription Google Sheets, appeler :
 *   mdssSynchroniserInscriptionApresEnregistrement(nouvelleLigneNum);
 * Aucune synchronisation de paiement n'est effectuée.
 */
function mdssSynchroniserInscriptionApresEnregistrement(numeroLigne) {
  var secret=PropertiesService.getScriptProperties().getProperty('MDSS_LEGACY_SYNC_SECRET');
  if (!secret || secret.length < 32) throw Error('Pont Smart School non configuré');
  var feuille=SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (!Number.isInteger(numeroLigne) || numeroLigne < 2) throw Error('Numéro de ligne invalide');

  // BJ (colonne 62) était libre lors de l'audit, vérifiez-le de nouveau avant installation.
  var colonne=62;
  var entete=feuille.getRange(1,colonne).getDisplayValue();
  if (entete && entete !== 'MDSS_EVENT_ID') throw Error('Colonne BJ déjà utilisée');
  if (!entete) feuille.getRange(1,colonne).setValue('MDSS_EVENT_ID');

  // Identifiant PERSISTANT pour rendre chaque tentative répétée idempotente.
  var cellule=feuille.getRange(numeroLigne,colonne);
  var id=String(cellule.getValue() || '').trim();
  if (!id) {
    id=Utilities.getUuid();
    cellule.setValue(id);
    SpreadsheetApp.flush();
  }

  var v=feuille.getRange(numeroLigne,1,1,12).getValues()[0];
  var x=feuille.getRange(numeroLigne,58,1,3).getValues()[0]; // BF:BH
  function txt(a){return (a===null||a===undefined)?'':String(a).trim()}
  function dIso(a){
    if (a instanceof Date && !isNaN(a.getTime())) return Utilities.formatDate(a,Session.getScriptTimeZone(),'yyyy-MM-dd');
    var t=txt(a);
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    var match=t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match?match[3]+'-'+match[2]+'-'+match[1]:'';
  }
  var classe=txt(v[9]),option=txt(v[10]);
  var inscription={
    full_name:txt(v[1]),birth_date:dIso(v[2]),birth_place:txt(v[3]),
    province:txt(v[4]),sector:txt(v[5]),address:txt(v[6]),
    father_name:txt(v[7]),mother_name:txt(v[8]),
    class_label:classe+(option?' · '+option:''),
    parent_phone:txt(v[11]),sex:txt(x[0]),prev_school:txt(x[1]),perm_number:txt(x[2])
  };
  if (!inscription.full_name || !classe) throw Error('Inscription incomplète');
  var body=JSON.stringify({event:'registration.created',event_id:id,registration:inscription});
  var now=String(Math.floor(Date.now()/1000));
  var bytes=Utilities.computeHmacSha256Signature(now+'.'+body,secret,Utilities.Charset.UTF_8);
  var signature=bytes.map(function(b){return ('0'+(b&255).toString(16)).slice(-2)}).join('');
  var url='https://lotzbcvzvgtsvszbigek.supabase.co/functions/v1/legacy-registration-bridge';
  var resp=UrlFetchApp.fetch(url,{
    method:'post',contentType:'application/json',payload:body,muteHttpExceptions:true,
    headers:{'x-mdss-timestamp':now,'x-mdss-signature':signature}
  });
  var status=resp.getResponseCode();
  if(status!==200)throw Error('Pont Smart School indisponible, code HTTP '+status+' ; identifiant conservé en BJ pour réessayer');
  // Ne PAS journaliser nom, date de naissance, téléphone, secret ou réponse brute.
  Logger.log('Inscription transmise au contrôle Smart School, référence '+id);
  return true;
}
