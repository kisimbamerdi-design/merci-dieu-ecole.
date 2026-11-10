-- Préparation seulement : NE PAS exécuter tant que la recette de test n'est pas signée.
-- Inscription externe unique, même en cas de nouvelle tentative Apps Script.
-- Aucune migration des données existantes et aucun paiement touché.
CREATE UNIQUE INDEX IF NOT EXISTS online_registrations_legacy_event_id_unique
ON public.online_registrations ((payload ->> 'legacy_event_id'))
WHERE payload ? 'legacy_event_id';

-- Vérification READ-ONLY à lancer avant et après la mise en place de l'index :
-- select payload->>'legacy_event_id' as source_id, count(*)
-- from public.online_registrations where payload ? 'legacy_event_id'
-- group by 1 having count(*)>1;
