-- ===========================================================================
-- SAKAY / SafeTrike - OPTIONAL demo account seed
-- ===========================================================================
-- You do NOT have to run this. The easiest way to make demo accounts is the
-- app's own "Sign Up" screen (it sets the role for you). Use this file only
-- if you want all 5 roles created in one shot for a defense demo.
--
-- Run it in the Supabase SQL Editor AFTER 0001_init.sql.
--
-- All 5 accounts use the password:  sakay1234
--   driver@sakay.test   student@sakay.test   parent@sakay.test
--   guard@sakay.test     admin@sakay.test
--
-- NOTE: the exact columns of Supabase's internal auth tables can change
-- between versions. If this script errors, just use the Sign Up screen or
-- Dashboard -> Authentication -> Add user instead - the result is the same.
-- ===========================================================================

do $$
declare
  demo record;
  uid  uuid;
begin
  for demo in
    select * from (values
      ('driver@sakay.test',  'driver',  'Juan Driver'),
      ('student@sakay.test', 'student', 'Maria Santos'),
      ('parent@sakay.test',  'parent',  'Mr. Santos'),
      ('guard@sakay.test',   'guard',   'Officer Reyes'),
      ('admin@sakay.test',   'admin',   'System Administrator')
    ) as t(email, role, full_name)
  loop
    -- skip if this email already exists
    if exists (select 1 from auth.users where email = demo.email) then
      continue;
    end if;

    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      uid, 'authenticated', 'authenticated', demo.email,
      crypt('sakay1234', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', demo.role, 'full_name', demo.full_name)
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      demo.email, uid,
      jsonb_build_object('sub', uid::text, 'email', demo.email),
      'email', now(), now(), now()
    );

    -- the on_auth_user_created trigger from 0001_init.sql already inserted the
    -- profile row from raw_user_meta_data; make sure the details are filled in.
    update public.profiles
      set role = demo.role, full_name = demo.full_name
      where id = uid;
  end loop;
end $$;

-- Give the demo driver believable details so the parent/guard screens look right.
update public.profiles p
  set phone = '09171234567',
      plate_number = 'SAF-789',
      license_number = 'L-998877',
      address = '123 Maharlika Highway, Cabanatuan City'
  from auth.users u
  where u.id = p.id and u.email = 'driver@sakay.test';
