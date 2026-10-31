# Recette avant publication officielle — Merci-Dieu Smart School
Date : 31 octobre 2026 · Candidate : 2026.10.31.6
Environnement de validation : https://deploy-preview-3--merci-dieu-smart-school.netlify.app/
**NE PAS annoncer « production validée » sans toutes les étapes ci-dessous.**
Coût supplémentaire autorisé : 0 $ (ne pas créer de branche Supabase payante).

## Tests automatiques déjà réussis
- GitHub Actions : 18 tests unitaires et statiques réussis.
- Netlify preview : page accueil, connexion, règlement, confidentialité 200.
- URLs internes `schema.sql`, `AGENTS.md`, `supabase/security/proposition_durcissement.sql` 404.
- Lien de démonstration falsifié : « Code non reconnu », aucun paiement certifié.
- Visite directe de l'espace `app.html` sans session : renvoi vers la connexion.

## Reste obligatoire avant pleine exploitation (tests manuels supervisés)
Ne jamais partager des identifiants, mots de passe ou données réelles dans GitHub.
Tester avec six comptes **de test**, sans données personnelles de véritables élèves. Révoquer les comptes une fois terminés.

| Rôle | Affichage autorisé | Tentatives qui DOIVENT être refusées |
|---|---|---|
| Promoteur | Administration, droits, finance, journal, toutes les classes | Aucun accès sans authentification |
| Directeur général | Personnel, inscriptions suivies, classes selon politique | Modification de droits promoteur, reçus si interdits |
| Directeur des études | Notes, horaires, classes de sa section | Salaires, caisse, autres sections |
| Préfet de discipline | Présences, discipline de sa section | Caisse, salaires, notes non autorisées |
| Comptable-secrétaire | Inscriptions, paiement, reçus, arriérés | Gestion promoteur, notes de professeur |
| Professeur | Ses classes, présences, notes, messages autorisés | Élèves d'autres classes, salaires et données financières |

### Parcours de bout en bout à signer
- [ ] Auth : connexion réussie, mauvais mot de passe refusé, déconnexion, session expirée, mot de passe oublié.
- [ ] Création utilisateur : seul promoteur actif peut créer/réinitialiser ; autre rôle reçoit 403.
- [ ] Élèves : ajout/modification/lecture depuis rôle autorisé ; nom capitalisé ; vérification du numéro matricule.
- [ ] Inscriptions publiques : saisir seulement des données fictives et vérifier réception et traitement administratif.
- [ ] Classes : création, section, affectation professeur ; interdiction autres sections.
- [ ] Présences : professeur peut travailler sur ses élèves et non sur d'autres.
- [ ] Notes : moyenne correcte selon dénominateur ; bulletin, impression, export ; interdiction des notes d'autrui.
- [ ] Paiements : en attente puis confirmé ; montant, reçu unique et non modifiable ; annulation et journal.
- [ ] Reçus : QR authentique accepté ; QR inventé/rejoué refusé ; aucune preuve uniquement par `?d=`.
- [ ] Caisse : rapprochement des paiements confirmés, clôture et audit.
- [ ] Trésorerie : une entrée et une sortie fictives, totaux corrects et contrôle des rôles.
- [ ] Documents et archives : lien externe approuvé, lecture/édition selon rôle, pas de publication involontaire.
- [ ] Bibliothèque : titres visibles, édition réservée aux profils autorisés.
- [ ] Circulaires : brouillon, publication, lecture et modification selon rôle.
- [ ] Agenda : événement, dates et autorisations, affichage mobile.
- [ ] Messages : aucun envoi SMS/WhatsApp non consenti ; pas de diffusion involontaire.
- [ ] Sauvegarde/restauration : méthode écrite, essai de restauration hors production (réversible et sans personnes réelles).
- [ ] Réseau instable : interruption pendant sauvegarde, message d'erreur clair ; aucun faux « 0 élève ».
- [ ] Android : accueil, tableau, menu, formulaire, PDF et liens testés sous Chrome sur Samsung A23.
- [ ] Confidentialité : coordonnées officielles de l'établissement, durée de conservation, procédure d'accès et consentements finalisés.
- [ ] Sécurité : contrôle des politiques RLS, accès refusés, politique QR minimisant les données serveur, double authentification administrateurs.

## Feu vert / feu rouge
**Feu rouge** si un rôle peut voir des données interdites, si un faux reçu est accepté, si un formulaire important est cassé, si une migration SQL non testée est nécessaire, ou si les identifiants sont exposés.

## Livraison et retour arrière
1. Préserver le commit actuellement déployé et son URL Netlify avant de publier.
2. Exécuter les tests CI + recette de prévisualisation.
3. Vérifier qu'aucun coût ou migration non autorisée n'est requis.
4. Fusionner la PR de livraison sur `main` uniquement après validation des parcours critiques.
5. Confirmer dans Netlify que le déploiement **production** est issu du bon commit, pas d'une ancienne preview.
6. Après déploiement : tests de connexion, accès parents, QR, console d'erreurs et navigation mobile.
7. En cas d'échec, restaurer le dernier déploiement confirmé depuis l'interface Netlify, sans toucher à Supabase.

La liste ci-dessus n'est pas un constat de réussite. Une case à cocher = test encore à effectuer et constater.
