-- PROPOSITION de minimisation du QR public (PAS appliquée).
-- A déployer uniquement après la mise à jour de verifier.html.
-- Aucun nom d'enfant, classe, motif ni montant n'est rendu à un visiteur.
CREATE OR REPLACE FUNCTION public.verify_qr(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE statut text; numero text; jour date;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-fA-F]{32}$' THEN
  RETURN jsonb_build_object('type','inconnu','valide',false);
 END IF;
 SELECT s.status::text INTO statut
 FROM public.students s WHERE s.qr_token=p_token;
 IF FOUND THEN
  RETURN jsonb_build_object('type','inscription','valide',statut='valide');
 END IF;
 SELECT p.status::text,p.receipt_no,p.paid_on INTO statut,numero,jour
 FROM public.payments p WHERE p.qr_token=p_token;
 IF FOUND THEN
  RETURN jsonb_build_object('type','paiement','valide',statut='confirme',
    'recu',CASE WHEN statut='confirme' THEN numero ELSE NULL END,
    'date',CASE WHEN statut='confirme' THEN jour ELSE NULL END);
 END IF;
 RETURN jsonb_build_object('type','inconnu','valide',false);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.verify_qr(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_qr(text) TO anon, authenticated;
