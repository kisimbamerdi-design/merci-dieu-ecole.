-- Anti-doublons du pont ancien site (migration anti_doublons_pont)
create unique index if not exists online_registrations_event_uidx on online_registrations ((payload->>'event_id')) where payload ? 'event_id';
create unique index if not exists online_payments_event_uidx on online_payments ((payload->>'event_id')) where payload ? 'event_id';
