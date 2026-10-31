-- ============================================================
--  COLLÈGE MERCI-DIEU · SMART SCHOOL
--  Base de données (Supabase / PostgreSQL) avec droits par rôle
--  À coller dans : Supabase > SQL Editor > New query > Run
-- ============================================================
--  RÔLES
--   promoteur         : voit tout, sans exception
--   direction          : Directeur Général — élèves, suivi scolaire, personnel,
--                avances (avec montants) ; AUCUN accès aux paiements, caisse, reçus
--   directeur_etudes   : Directeur des Études — classes, horaires, notes ;
--                rattaché à une section (profiles.section) : Primaire (Maternelle+Primaire,
--                affiché "Directeur") ou Secondaire (Éducation de Base+Secondaire, affiché
--                "Préfet") ; section = null -> toutes les sections. Pas d'accès à l'argent ni au personnel.
--   prefet_discipline  : Directeur de Discipline — présences/discipline, même logique de
--                section que ci-dessus (un titulaire + un second par section, même rôle,
--                même section). Pas d'accès aux notes, à l'argent ni au personnel.
--   comptable  : comptable-secrétaire : inscriptions, paiements, reçus
--                (seul rôle qui imprime les reçus), versement des avances
--   professeur : élèves, présences et notes de SES classes uniquement
-- ============================================================

create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('promoteur','direction','directeur_etudes','prefet_discipline','comptable','professeur');
exception when duplicate_object then null; end $$;

-- ---------- Comptes ----------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        app_role not null default 'professeur',
  active      boolean not null default false,   -- le compte reste bloqué tant que le promoteur ne l'active pas
  section     text check (section is null or section in ('Maternelle','Primaire','Éducation de Base','Secondaire')),
                                                 -- pour directeur_etudes / prefet_discipline : section supervisée (null = toutes)
  phone       text,
  created_at  timestamptz not null default now()
);

create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function my_section() returns text
language sql stable security definer set search_path = public as $$
  select section from profiles where id = auth.uid() and active
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Classes et affectations des professeurs ----------
create table if not exists classes (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,                      -- ex. 3ème, Secondaire 2
  section   text not null check (section in ('Maternelle','Primaire','Éducation de Base','Secondaire')),
  option    text not null,                      -- ex. Primaire, Électricité, Pédagogie Générale
  year      text not null default '2026-2027',
  unique (name, option, year)
);

create table if not exists teacher_classes (
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_id   uuid not null references classes(id) on delete cascade,
  primary key (teacher_id, class_id)
);

create or replace function my_class_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select class_id from teacher_classes where teacher_id = auth.uid()
$$;

-- ---------- Élèves (fiche d'inscription du collège) ----------
create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  matricule     text unique,
  full_name     text not null,
  sex           text check (sex in ('Masculin','Féminin')),
  birth_date    date,
  birth_place   text,
  prev_school   text,
  perm_number   text,                            -- numéro permanent
  province      text,
  sector        text,
  address       text,
  father_name   text,
  mother_name   text,
  parent_phone  text,
  class_id      uuid references classes(id),
  social_case   boolean not null default false,  -- cas social (5ème enfant gratuit)
  status        text not null default 'a_verifier'
                check (status in ('a_verifier','a_completer','valide','refuse')),
  enrolled_on   date,                            -- date d'inscription (inscription tardive : mois passés à 50 %)
  created_at    timestamptz not null default now(),
  created_by    uuid references profiles(id)
);
alter table students add column if not exists enrolled_on date;

-- Inscriptions faites par les parents sur le site public (remplace Google Sheets + Telegram)
create table if not exists online_registrations (
  id            uuid primary key default gen_random_uuid(),
  payload       jsonb not null,                  -- tous les champs de la fiche
  received_at   timestamptz not null default now(),
  processed     boolean not null default false,
  student_id    uuid references students(id)
);

-- ---------- Argent : réservé au comptable et au promoteur ----------
create table if not exists fee_rates (
  key     text primary key,                      -- ex. NIVEAU_PRIMAIRE, ETAT_SEC_4
  label   text not null,
  amount  numeric(12,0) not null check (amount >= 0)
);

insert into fee_rates (key,label,amount) values
 ('NIVEAU_MATERNELLE','Maternelle',31000),
 ('NIVEAU_PRIMAIRE','Primaire',20000),
 ('NIVEAU_7_8','7ème / 8ème Éducation de Base',34000),
 ('NIVEAU_SEC_1_3','Humanités 1ère à 3ème',35000),
 ('NIVEAU_SEC_4','Humanités 4ème (montant à confirmer)',34000),
 ('ETAT_MATERNELLE','Frais de l''État - Maternelle (par tranche)',10000),
 ('ETAT_PRIMAIRE','Frais de l''État - Primaire (par tranche)',10000),
 ('ETAT_7_8','Frais de l''État - 7ème/8ème (par tranche)',17500),
 ('ETAT_SEC_1_3','Frais de l''État - Secondaire 1ère à 3ème (par tranche)',22500),
 ('ETAT_SEC_4','Frais de l''État - Secondaire 4ème (par tranche)',25000)
on conflict (key) do nothing;
-- Tarifs 2026-2027 communiqués par la propriétaire : maternelle 31 000, primaire 20 000, 7e/8e 34 000, humanités 1ère à 3ème 35 000.
-- À confirmer auprès du directeur : humanités 4ème (34 000 hérité du classeur) et frais de l'État. Déjà modifiés dans la base en direct.
-- Règle : un élève inscrit en retard paie les mois passés à settings.late_enrolment_pct % (50 par défaut), modifiable par le promoteur.

create sequence if not exists receipt_seq;

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id),
  reason        text not null,                   -- Frais mensuel — Octobre, Frais de l'État, Frais Technique, Minervale
  amount        numeric(12,0) not null check (amount > 0),
  method        text not null default 'Espèces',
  paid_on       date not null default current_date,
  status        text not null default 'en_attente'
                check (status in ('en_attente','confirme','annule')),
  receipt_no    text unique,                     -- attribué à la confirmation, jamais modifiable
  print_count   int not null default 0,
  cancel_reason text,
  created_by    uuid references profiles(id),
  confirmed_by  uuid references profiles(id),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create or replace function payment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'en_attente'; new.receipt_no := null;
    new.created_by := auth.uid();
    return new;
  end if;
  -- un paiement confirmé ne change plus ni de montant ni d'élève
  if old.status = 'confirme' and (new.amount <> old.amount or new.student_id <> old.student_id or new.receipt_no is distinct from old.receipt_no) then
    raise exception 'Un paiement confirmé ne peut plus être modifié.';
  end if;
  if old.status = 'annule' then
    raise exception 'Un paiement annulé est conservé tel quel.';
  end if;
  if old.status = 'en_attente' and new.status = 'confirme' then
    new.receipt_no   := 'MD-REC-' || lpad(nextval('receipt_seq')::text, 6, '0');
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  end if;
  if new.status = 'annule' and length(coalesce(new.cancel_reason,'')) < 5 then
    raise exception 'Motif d''annulation obligatoire (5 caractères minimum).';
  end if;
  return new;
end $$;

drop trigger if exists payments_guard on payments;
create trigger payments_guard before insert or update on payments
  for each row execute function payment_guard();

-- Clôture de caisse de fin de journée
create table if not exists cash_closings (
  id             uuid primary key default gen_random_uuid(),
  day            date not null unique,
  expected_total numeric(12,0) not null,        -- somme des paiements confirmés du jour
  counted_total  numeric(12,0) not null,        -- argent réellement compté
  note           text,
  closed_by      uuid references profiles(id),
  closed_at      timestamptz not null default now()
);

-- ---------- Personnel et avances sur salaire ----------
create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid unique references profiles(id),
  full_name   text not null,
  function    text not null,                    -- Directeur, Enseignant Secondaire, Caissier, ...
  section     text,
  phone       text
);

create table if not exists salary_advances (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id),
  amount        numeric(12,0) not null check (amount > 0),
  reason        text,
  deduct_month  text,
  status        text not null default 'demandee'
                check (status in ('demandee','signee','refusee','versee')),
  requested_at  timestamptz not null default now(),
  signed_by     uuid references profiles(id),   -- signature de la direction
  signed_at     timestamptz,
  paid_by       uuid references profiles(id),   -- versement par le comptable-secrétaire
  paid_at       timestamptz
);

-- Circuit : professeur demande -> direction signe -> comptable verse
create or replace function advance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r app_role := my_role();
begin
  if tg_op = 'INSERT' then
    new.status := 'demandee';
    return new;
  end if;
  if r = 'promoteur' then return new; end if;
  if old.amount <> new.amount or old.staff_id <> new.staff_id then
    raise exception 'Montant et bénéficiaire ne peuvent plus être modifiés.';
  end if;
  if old.status = 'demandee' and new.status in ('signee','refusee') then
    if r <> 'direction' then raise exception 'Seule la direction signe une avance.'; end if;
    new.signed_by := auth.uid(); new.signed_at := now();
  elsif old.status = 'signee' and new.status = 'versee' then
    if r <> 'comptable' then raise exception 'Seul le comptable-secrétaire verse une avance.'; end if;
    new.paid_by := auth.uid(); new.paid_at := now();
  elsif old.status <> new.status then
    raise exception 'Changement de statut non autorisé.';
  end if;
  return new;
end $$;

drop trigger if exists advances_guard on salary_advances;
create trigger advances_guard before insert or update on salary_advances
  for each row execute function advance_guard();

-- Salaires de base : promoteur et direction seulement
create table if not exists staff_pay (
  staff_id    uuid primary key references staff(id) on delete cascade,
  base_salary numeric(12,0) not null default 0 check (base_salary >= 0)
);
alter table staff_pay enable row level security;
create policy pay_staff_read on staff_pay for select using (my_role() in ('promoteur','direction'));
create policy pay_staff_write on staff_pay for all
  using (my_role() in ('promoteur','direction')) with check (my_role() in ('promoteur','direction'));

-- ---------- Vie scolaire ----------
create table if not exists attendance (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class_id   uuid not null references classes(id),
  day        date not null default current_date,
  state      text not null check (state in ('present','absent','retard','excuse')),
  taken_by   uuid references profiles(id) default auth.uid(),
  unique (student_id, day)
);

create table if not exists grades (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class_id   uuid not null references classes(id),
  period     text not null check (period in ('1er trimestre','2e trimestre','3e trimestre')),
  subject    text not null,
  score      numeric(6,2) not null check (score >= 0),
  max_score  numeric(6,2) not null check (max_score > 0),
  entered_by uuid references profiles(id) default auth.uid(),
  entered_at timestamptz not null default now(),
  check (score <= max_score)
);

create table if not exists timetable (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references classes(id),
  teacher_id uuid references profiles(id),
  day        text not null check (day in ('Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi')),
  start_time time not null,
  end_time   time not null,
  subject    text not null,
  check (end_time > start_time)
);

-- ---------- Réglages (forme du reçu 80 mm, etc.) ----------
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);
insert into settings (key, value) values
 ('receipt_template', '{"paper_mm":80,"show_logo":true,"header":"COLLÈGE MERCI-DIEU","subheader":"Distinction · Docilité · Charité","fields":["receipt_no","date","student","class","reason","amount","amount_words","method","cashier"],"footer":"Merci de votre confiance.","show_stamp_box":true}')
on conflict (key) do nothing;

-- ---------- Journal des opérations ----------
create table if not exists audit_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid default auth.uid(),
  action  text not null,
  ref     text,
  detail  text
);

-- ============================================================
--  RÈGLES D'ACCÈS (Row Level Security) : appliquées par le serveur
-- ============================================================
alter table profiles             enable row level security;
alter table classes              enable row level security;
alter table teacher_classes      enable row level security;
alter table students             enable row level security;
alter table online_registrations enable row level security;
alter table fee_rates            enable row level security;
alter table payments             enable row level security;
alter table cash_closings        enable row level security;
alter table staff                enable row level security;
alter table salary_advances      enable row level security;
alter table attendance           enable row level security;
alter table grades               enable row level security;
alter table timetable            enable row level security;
alter table settings             enable row level security;
alter table audit_log            enable row level security;

-- profiles : chacun voit son compte ; direction/promoteur/comptable voient la liste ; seul le promoteur modifie
create policy profiles_read on profiles for select using (
  id = auth.uid() or my_role() in ('promoteur','direction','comptable'));
create policy profiles_admin on profiles for all
  using (my_role() = 'promoteur') with check (my_role() = 'promoteur');

-- classes : tout compte actif les voit ; le promoteur et la direction les gèrent
create policy classes_read on classes for select using (my_role() is not null);
create policy classes_write on classes for all
  using (my_role() in ('promoteur','direction')
    or (my_role() = 'directeur_etudes' and (my_section() is null or section = my_section())))
  with check (my_role() in ('promoteur','direction')
    or (my_role() = 'directeur_etudes' and (my_section() is null or section = my_section())));

create policy tc_read on teacher_classes for select using (
  teacher_id = auth.uid() or my_role() in ('promoteur','direction','directeur_etudes'));
create policy tc_write on teacher_classes for all
  using (my_role() in ('promoteur','direction')
    or (my_role() = 'directeur_etudes'
      and (my_section() is null or exists(select 1 from classes c where c.id = teacher_classes.class_id and c.section = my_section()))))
  with check (my_role() in ('promoteur','direction')
    or (my_role() = 'directeur_etudes'
      and (my_section() is null or exists(select 1 from classes c where c.id = teacher_classes.class_id and c.section = my_section()))));

-- élèves : professeur = seulement ses classes
create policy students_read on students for select using (
  my_role() in ('promoteur','direction','comptable')
  or (my_role() in ('directeur_etudes','prefet_discipline')
    and (my_section() is null or exists(select 1 from classes c where c.id = students.class_id and c.section = my_section())))
  or (my_role() = 'professeur' and class_id in (select my_class_ids())));
create policy students_write on students for all
  using (my_role() in ('promoteur','comptable'))
  with check (my_role() in ('promoteur','comptable'));

-- inscriptions en ligne : le public peut déposer une demande, le personnel la traite
create policy reg_insert_public on online_registrations for insert
  to anon, authenticated with check (processed = false and student_id is null);
create policy reg_read on online_registrations for select using (my_role() in ('promoteur','comptable'));
create policy reg_update on online_registrations for update
  using (my_role() in ('promoteur','comptable')) with check (my_role() in ('promoteur','comptable'));

-- ARGENT : ni la direction ni les professeurs
create policy fees_read on fee_rates for select using (my_role() in ('promoteur','comptable'));
create policy fees_write on fee_rates for all
  using (my_role() = 'promoteur') with check (my_role() = 'promoteur');

create policy pay_read on payments for select using (my_role() in ('promoteur','comptable'));
create policy pay_insert on payments for insert with check (my_role() in ('comptable','promoteur'));
create policy pay_update on payments for update
  using (my_role() in ('comptable','promoteur')) with check (my_role() in ('comptable','promoteur'));
-- aucune règle de suppression : un paiement ne se supprime jamais, il s'annule avec un motif

create policy cash_read on cash_closings for select using (my_role() in ('promoteur','comptable'));
create policy cash_insert on cash_closings for insert with check (my_role() in ('comptable','promoteur'));

-- impression d'un reçu : réservée au comptable-secrétaire (compte les impressions)
create or replace function print_receipt(p_id uuid) returns payments
language plpgsql security definer set search_path = public as $$
declare p payments;
begin
  if my_role() not in ('comptable','promoteur') then
    raise exception 'Seul le comptable-secrétaire peut imprimer les reçus.';
  end if;
  update payments set print_count = print_count + 1
   where id = p_id and status = 'confirme' returning * into p;
  if p.id is null then raise exception 'Seul un paiement confirmé donne lieu à un reçu.'; end if;
  insert into audit_log(action, ref, detail)
   values (case when p.print_count > 1 then 'Réimpression du reçu' else 'Impression du reçu' end,
           p.receipt_no, 'n°' || p.print_count);
  return p;
end $$;

-- personnel et avances : la direction voit les montants
create policy staff_read on staff for select using (
  my_role() in ('promoteur','direction','comptable') or profile_id = auth.uid());
create policy staff_write on staff for all
  using (my_role() in ('promoteur','direction')) with check (my_role() in ('promoteur','direction'));

create policy adv_read on salary_advances for select using (
  my_role() in ('promoteur','direction','comptable')
  or staff_id in (select id from staff where profile_id = auth.uid()));
create policy adv_insert on salary_advances for insert with check (
  my_role() in ('promoteur','direction','comptable')
  or staff_id in (select id from staff where profile_id = auth.uid()));
create policy adv_update on salary_advances for update
  using (my_role() in ('promoteur','direction','comptable'))
  with check (my_role() in ('promoteur','direction','comptable'));

-- présences et notes : professeur = ses classes ; direction et promoteur consultent tout
create policy att_read on attendance for select using (
  my_role() = 'promoteur'
  or (my_role() in ('direction','prefet_discipline')
    and (my_role() = 'direction' or my_section() is null or exists(select 1 from classes c where c.id = attendance.class_id and c.section = my_section())))
  or (my_role() = 'professeur' and class_id in (select my_class_ids())));
create policy att_write on attendance for all
  using (my_role() = 'promoteur'
    or (my_role() = 'prefet_discipline'
      and (my_section() is null or exists(select 1 from classes c where c.id = attendance.class_id and c.section = my_section())))
    or (my_role() = 'professeur' and class_id in (select my_class_ids())))
  with check (my_role() = 'promoteur'
    or (my_role() = 'prefet_discipline'
      and (my_section() is null or exists(select 1 from classes c where c.id = attendance.class_id and c.section = my_section())))
    or (my_role() = 'professeur' and class_id in (select my_class_ids())));

create policy grades_read on grades for select using (
  my_role() in ('promoteur','direction')
  or (my_role() = 'directeur_etudes'
    and (my_section() is null or exists(select 1 from classes c where c.id = grades.class_id and c.section = my_section())))
  or (my_role() = 'professeur' and class_id in (select my_class_ids())));
create policy grades_write on grades for all
  using (my_role() = 'promoteur'
    or (my_role() = 'directeur_etudes'
      and (my_section() is null or exists(select 1 from classes c where c.id = grades.class_id and c.section = my_section())))
    or (my_role() = 'professeur' and class_id in (select my_class_ids())))
  with check (my_role() = 'promoteur'
    or (my_role() = 'directeur_etudes'
      and (my_section() is null or exists(select 1 from classes c where c.id = grades.class_id and c.section = my_section())))
    or (my_role() = 'professeur' and class_id in (select my_class_ids())));

create policy tt_read on timetable for select using (
  my_role() in ('promoteur','direction')
  or (my_role() = 'directeur_etudes'
    and (my_section() is null or exists(select 1 from classes c where c.id = timetable.class_id and c.section = my_section())))
  or (my_role() = 'professeur' and (teacher_id = auth.uid() or class_id in (select my_class_ids()))));
create policy tt_write on timetable for all
  using (my_role() in ('promoteur','direction')
    or (my_role() = 'directeur_etudes'
      and (my_section() is null or exists(select 1 from classes c where c.id = timetable.class_id and c.section = my_section()))))
  with check (my_role() in ('promoteur','direction')
    or (my_role() = 'directeur_etudes'
      and (my_section() is null or exists(select 1 from classes c where c.id = timetable.class_id and c.section = my_section()))));

-- réglages : lecture par le comptable (forme du reçu), écriture par le promoteur
create policy set_read on settings for select using (my_role() in ('promoteur','direction','comptable'));
create policy set_write on settings for all
  using (my_role() = 'promoteur') with check (my_role() = 'promoteur');

-- le comptable-secrétaire peut modifier la forme du reçu (et seulement elle)
create policy set_receipt_ins on settings for insert with check (my_role() = 'comptable' and key = 'receipt_template');
create policy set_receipt_upd on settings for update
  using (my_role() = 'comptable' and key = 'receipt_template')
  with check (my_role() = 'comptable' and key = 'receipt_template');

-- journal : le promoteur lit tout ; tout compte actif peut y écrire
create policy log_read on audit_log for select using (my_role() = 'promoteur');
create policy log_insert on audit_log for insert with check (my_role() is not null);

-- ============================================================
--  CODE QR DE VALIDATION (inscription et paiement)
--  Chaque élève et chaque paiement reçoit un jeton secret et unique.
--  Le parent scanne le QR : la page publique appelle verify_qr()
--  qui renvoie seulement l'essentiel (jamais d'autres données).
-- ============================================================
alter table students add column if not exists qr_token text unique default encode(gen_random_bytes(16),'hex');
alter table payments add column if not exists qr_token text unique default encode(gen_random_bytes(16),'hex');

create or replace function verify_qr(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s record; p record;
begin
  select st.full_name, c.name as class_name, c.option as class_option, st.status as st_status into s
    from students st left join classes c on c.id = st.class_id
   where st.qr_token = p_token;
  if found then
    return jsonb_build_object('type','inscription','eleve',s.full_name,
      'classe',coalesce(s.class_name,'') || ' · ' || coalesce(s.class_option,''),
      'valide',(s.st_status = 'valide'));
  end if;
  select st.full_name, c.name as class_name, pay.reason, pay.amount, pay.paid_on,
         pay.receipt_no, pay.status as pay_status into p
    from payments pay join students st on st.id = pay.student_id
    left join classes c on c.id = st.class_id
   where pay.qr_token = p_token;
  if found then
    return jsonb_build_object('type','paiement','eleve',p.full_name,'classe',p.class_name,
      'motif',p.reason,'montant',p.amount,'date',p.paid_on,'recu',p.receipt_no,
      'valide',(p.pay_status = 'confirme'));
  end if;
  return jsonb_build_object('type','inconnu','valide',false);
end $$;
grant execute on function verify_qr(text) to anon, authenticated;

-- ============================================================
--  ÉTAPE FINALE (une seule fois, après avoir créé votre compte dans
--  Supabase > Authentication > Users) : faire de vous le promoteur.
--  Remplacez l'adresse par la vôtre.
--
--  update profiles set role = 'promoteur', active = true
--   where id = (select id from auth.users where email = 'VOTRE-ADRESSE');
-- ============================================================

-- ============================================================
--  NOMS EN MAJUSCULES (règle de l'école : tout nom s'enregistre en majuscules)
--  Garanti par la base, quel que soit le chemin (formulaire, import, assistant).
-- ============================================================
create or replace function students_upper() returns trigger language plpgsql set search_path = public as $$
begin
  new.full_name   := upper(btrim(new.full_name));
  new.father_name := upper(btrim(new.father_name));
  new.mother_name := upper(btrim(new.mother_name));
  new.birth_place := upper(btrim(new.birth_place));
  new.prev_school := upper(btrim(new.prev_school));
  new.province    := upper(btrim(new.province));
  new.sector      := upper(btrim(new.sector));
  new.address     := upper(btrim(new.address));
  return new;
end $$;
create trigger students_upper_trg before insert or update on students for each row execute function students_upper();

create or replace function staff_upper() returns trigger language plpgsql set search_path = public as $$
begin
  new.full_name := upper(btrim(new.full_name));
  return new;
end $$;
create trigger staff_upper_trg before insert or update on staff for each row execute function staff_upper();

revoke execute on function students_upper() from public, anon, authenticated;
revoke execute on function staff_upper() from public, anon, authenticated;

-- ============================================================
--  COMMUNICATION INTERNE (messages entre membres du personnel)
--  Lecture : l'expéditeur, ou le rôle destinataire, ou tout le personnel.
-- ============================================================
create table if not exists staff_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  sender_id   uuid not null references profiles(id),
  sender_name text,
  sender_role app_role,
  to_role     app_role,
  to_all      boolean not null default false,
  subject     text check (subject is null or char_length(subject) <= 120),
  body        text not null check (char_length(body) between 1 and 2000),
  read_by     uuid[] not null default '{}',
  check ((to_role is not null)::int + to_all::int = 1)
);
alter table staff_messages enable row level security;

create or replace function staff_messages_fill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sender_id   := auth.uid();
  new.sender_name := (select full_name from profiles where id = auth.uid());
  new.sender_role := my_role();
  new.read_by     := array[auth.uid()];
  return new;
end $$;
create trigger staff_messages_fill_trg before insert on staff_messages for each row execute function staff_messages_fill();

create policy msg_insert on staff_messages for insert with check (my_role() is not null);
create policy msg_read on staff_messages for select
  using (my_role() is not null and (sender_id = auth.uid() or to_all or to_role = my_role()));

create or replace function mark_message_read(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then return; end if;
  update staff_messages set read_by = array_append(read_by, auth.uid())
   where id = p_id and not (auth.uid() = any(read_by))
     and (sender_id = auth.uid() or to_all or to_role = my_role());
end $$;

revoke all on staff_messages from anon;
revoke execute on function staff_messages_fill() from public, anon, authenticated;
revoke execute on function mark_message_read(uuid) from public, anon;
grant execute on function mark_message_read(uuid) to authenticated;

-- Messages adressés par zone (primaire / secondaire) : un titulaire ou son second voit les messages de sa zone.
alter table staff_messages add column if not exists to_zone text check (to_zone is null or to_zone in ('Primaire','Secondaire'));
create or replace function my_zone() returns text language sql stable security definer set search_path = public as $$
  select case when section in ('Maternelle','Primaire') then 'Primaire'
              when section in ('Éducation de Base','Secondaire') then 'Secondaire' end
  from profiles where id = auth.uid() and active
$$;
revoke execute on function my_zone() from public, anon;
grant execute on function my_zone() to authenticated;
alter policy msg_read on staff_messages
  using (my_role() is not null and (sender_id = auth.uid() or to_all
        or (to_role = my_role() and (to_zone is null or my_zone() is null or my_zone() = to_zone))));
create or replace function mark_message_read(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then return; end if;
  update staff_messages set read_by = array_append(read_by, auth.uid())
   where id = p_id and not (auth.uid() = any(read_by))
     and (sender_id = auth.uid() or to_all
          or (to_role = my_role() and (to_zone is null or my_zone() is null or my_zone() = to_zone)));
end $$;

-- Le règlement d'ordre intérieur (clés roi_*) est lisible par tout compte actif ; l'écriture reste au promoteur (set_write).
create policy set_read_roi on settings for select using (my_role() is not null and key like 'roi\_%');

-- ============================================================
--  MODULES « FONCTIONNALITÉS » : trésorerie, circulaires, documents/archives/bibliothèque, agenda
--  Toutes les tables : RLS activée, aucun accès anon.
-- ============================================================
create table if not exists treasury_entries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  day         date not null default current_date,
  kind        text not null check (kind in ('entree','sortie')),
  category    text not null check (char_length(category) between 1 and 60),
  label       text not null check (char_length(label) between 1 and 200),
  amount      numeric(12,0) not null check (amount > 0),
  created_by  uuid not null default auth.uid() references profiles(id)
);
alter table treasury_entries enable row level security;
create policy tre_read   on treasury_entries for select using (my_role() in ('promoteur','comptable'));
create policy tre_insert on treasury_entries for insert with check (my_role() in ('promoteur','comptable') and created_by = auth.uid());
create policy tre_delete on treasury_entries for delete using (my_role() = 'promoteur');

create table if not exists circulars (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 1 and 160),
  body        text not null check (char_length(body) between 1 and 5000),
  status      text not null default 'brouillon' check (status in ('brouillon','publie')),
  published_at timestamptz,
  author_id   uuid not null default auth.uid() references profiles(id),
  author_name text
);
alter table circulars enable row level security;
create policy circ_read on circulars for select
  using (my_role() is not null and (status = 'publie' or author_id = auth.uid() or my_role() = 'promoteur'));
create policy circ_insert on circulars for insert
  with check (my_role() in ('promoteur','direction','directeur_etudes') and author_id = auth.uid());
create policy circ_update on circulars for update
  using (my_role() = 'promoteur' or (author_id = auth.uid() and my_role() in ('direction','directeur_etudes')))
  with check (my_role() = 'promoteur' or (author_id = auth.uid() and my_role() in ('direction','directeur_etudes')));
create policy circ_delete on circulars for delete using (my_role() = 'promoteur');

create table if not exists school_documents (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 1 and 160),
  category    text not null default 'Document' check (category in ('Document','Bibliothèque','Formulaire','Rapport')),
  url         text check (url is null or url ~* '^https://'),
  note        text check (note is null or char_length(note) <= 1000),
  archived    boolean not null default false,
  created_by  uuid not null default auth.uid() references profiles(id)
);
alter table school_documents enable row level security;
create policy doc_read   on school_documents for select using (my_role() is not null);
create policy doc_insert on school_documents for insert with check (my_role() in ('promoteur','direction','directeur_etudes') and created_by = auth.uid());
create policy doc_update on school_documents for update using (my_role() in ('promoteur','direction','directeur_etudes')) with check (my_role() in ('promoteur','direction','directeur_etudes'));
create policy doc_delete on school_documents for delete using (my_role() = 'promoteur');

create table if not exists agenda_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  day         date not null,
  end_day     date,
  title       text not null check (char_length(title) between 1 and 160),
  kind        text not null default 'Événement' check (kind in ('Événement','Réunion','Examen','Congé','Échéance')),
  zone        text check (zone is null or zone in ('Primaire','Secondaire')),
  note        text check (note is null or char_length(note) <= 1000),
  created_by  uuid not null default auth.uid() references profiles(id),
  check (end_day is null or end_day >= day)
);
alter table agenda_events enable row level security;
create policy ag_read   on agenda_events for select using (my_role() is not null);
create policy ag_insert on agenda_events for insert with check (my_role() in ('promoteur','direction','directeur_etudes') and created_by = auth.uid());
create policy ag_update on agenda_events for update using (my_role() in ('promoteur','direction','directeur_etudes')) with check (my_role() in ('promoteur','direction','directeur_etudes'));
create policy ag_delete on agenda_events for delete using (my_role() in ('promoteur','direction','directeur_etudes'));

revoke all on treasury_entries, circulars, school_documents, agenda_events from anon;
