-- ============================================================
-- Seasonz Unified Seed — Works for both App & Dashboard
-- ============================================================

-- ── Auth users (with proper format for Supabase Auth v2+) ────────────────────

INSERT INTO auth.users (
  instance_id, id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, aud, role,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change_token, email_change_token_current, reauthentication_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'nathan@seasonz.dev',   crypt('password123', gen_salt('bf', 10)), now(), now() - interval '6 months', now(), '{"provider":"email","providers":["email"]}', '{"sub":"11111111-1111-1111-1111-111111111111","email":"nathan@seasonz.dev","email_verified":true,"phone_verified":false}', 'authenticated', 'authenticated', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'jordan@seasonz.dev',   crypt('password123', gen_salt('bf', 10)), now(), now() - interval '5 months', now(), '{"provider":"email","providers":["email"]}', '{"sub":"22222222-2222-2222-2222-222222222222","email":"jordan@seasonz.dev","email_verified":true,"phone_verified":false}', 'authenticated', 'authenticated', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'lena@seasonz.dev',     crypt('password123', gen_salt('bf', 10)), now(), now() - interval '4 months', now(), '{"provider":"email","providers":["email"]}', '{"sub":"33333333-3333-3333-3333-333333333333","email":"lena@seasonz.dev","email_verified":true,"phone_verified":false}', 'authenticated', 'authenticated', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'sam@seasonz.dev',      crypt('password123', gen_salt('bf', 10)), now(), now() - interval '4 months', now(), '{"provider":"email","providers":["email"]}', '{"sub":"44444444-4444-4444-4444-444444444444","email":"sam@seasonz.dev","email_verified":true,"phone_verified":false}', 'authenticated', 'authenticated', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'marcus@seasonz.dev',   crypt('password123', gen_salt('bf', 10)), now(), now() - interval '3 months', now(), '{"provider":"email","providers":["email"]}', '{"sub":"55555555-5555-5555-5555-555555555555","email":"marcus@seasonz.dev","email_verified":true,"phone_verified":false}', 'authenticated', 'authenticated', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'nnhaswell@gmail.com',  crypt('password123', gen_salt('bf', 10)), now(), now() - interval '1 month', now(), '{"provider":"email","providers":["email"]}', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"nnhaswell@gmail.com","email_verified":true,"phone_verified":false}', 'authenticated', 'authenticated', '', '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ── Auth identities (REQUIRED for Auth v2+) ──────────────────────────────────

INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'email', '{"sub":"11111111-1111-1111-1111-111111111111","email":"nathan@seasonz.dev","email_verified":true}', now(), now() - interval '6 months', now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'email', '{"sub":"22222222-2222-2222-2222-222222222222","email":"jordan@seasonz.dev","email_verified":true}', now(), now() - interval '5 months', now()),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'email', '{"sub":"33333333-3333-3333-3333-333333333333","email":"lena@seasonz.dev","email_verified":true}',   now(), now() - interval '4 months', now()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'email', '{"sub":"44444444-4444-4444-4444-444444444444","email":"sam@seasonz.dev","email_verified":true}',    now(), now() - interval '4 months', now()),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 'email', '{"sub":"55555555-5555-5555-5555-555555555555","email":"marcus@seasonz.dev","email_verified":true}', now(), now() - interval '3 months', now()),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"nnhaswell@gmail.com","email_verified":true}', now(), now() - interval '1 month', now())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ── Profiles ──────────────────────────────────────────────────────────────────

INSERT INTO public.profiles (id, display_name, handle, avatar_url, bio, active_season, onboarding_complete, is_superuser, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Nathan',        'nathan',   'https://i.pravatar.cc/150?img=1', 'Building Seasonz. Superuser.',        'future',  true, true,  now() - interval '6 months'),
  ('22222222-2222-2222-2222-222222222222', 'Jordan Chen',   'jordan',   'https://i.pravatar.cc/150?img=2', 'Former startup founder.',              'past',    true, false, now() - interval '5 months'),
  ('33333333-3333-3333-3333-333333333333', 'Lena Kowalski', 'lena',     'https://i.pravatar.cc/150?img=3', 'Designer → Product Manager.',          'present', true, false, now() - interval '4 months'),
  ('44444444-4444-4444-4444-444444444444', 'Sam Ortiz',     'samortiz', 'https://i.pravatar.cc/150?img=4', 'Retired athlete → Sports tech.',       'past',    true, false, now() - interval '4 months'),
  ('55555555-5555-5555-5555-555555555555', 'Marcus Webb',   'marcus',   'https://i.pravatar.cc/150?img=5', 'Full-stack engineer, climate tech.',   'present', true, false, now() - interval '3 months'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nathaniel',    'nnhaswell', 'https://i.pravatar.cc/150?img=10', 'Seasonz founder. Testing all features.', 'future',  true, true,  now() - interval '1 month')
ON CONFLICT (id) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  handle              = EXCLUDED.handle,
  avatar_url          = EXCLUDED.avatar_url,
  bio                 = EXCLUDED.bio,
  active_season       = EXCLUDED.active_season,
  onboarding_complete = EXCLUDED.onboarding_complete,
  is_superuser        = EXCLUDED.is_superuser;

-- ── Groups (using app's seeded UUIDs + custom ones) ──────────────────────────

INSERT INTO public.groups (id, name, description, season, is_public, created_by, created_at, member_count) VALUES
  ('00000000-0000-0000-0000-000000000001', 'women in wellness',     'a space for women navigating health, recovery, and the in-between',                         'present', true, null, now() - interval '6 months', 0),
  ('00000000-0000-0000-0000-000000000002', 'strength & training',   'building physical and mental strength together',                                            'present', true, null, now() - interval '5 months', 0),
  ('00000000-0000-0000-0000-000000000003', 'transplant community',  'for transplant patients, families, and donors',                                             'multi',   true, null, now() - interval '4 months', 0),
  ('00000000-0000-0000-0000-000000000004', 'university years',      'the chapter before the chapter',                                                            'past',    true, null, now() - interval '3 months', 0),
  ('00000000-0000-0000-0000-000000000005', 'career changers',       'people who left what they were supposed to do and are building what they actually want',    'future',  true, null, now() - interval '2 months', 0),
  -- Test groups for nnhaswell@gmail.com
  ('10000000-0000-0000-0000-000000000001', 'Founders in Transition', 'For founders who have sold, stepped away, or are taking a break. What comes after the exit?', 'past',    true, null, now() - interval '1 month', 0),
  ('10000000-0000-0000-0000-000000000002', 'Creative Pivots',        'Designers, writers, and makers shifting into new roles or industries.',                       'present', true, null, now() - interval '1 month', 0),
  ('10000000-0000-0000-0000-000000000003', 'Building What''s Next',  'People building toward the future version of themselves.',                                    'future',  true, null, now() - interval '1 month', 0)
ON CONFLICT (id) DO NOTHING;

-- ── Group Members ─────────────────────────────────────────────────────────────

INSERT INTO public.group_members (group_id, user_id, role, joined_at) VALUES
  -- Jordan: champion of women in wellness
  ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'champion', now() - interval '5 months'),
  -- Lena: champion of strength & training
  ('00000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'champion', now() - interval '4 months'),
  -- Sam: member of transplant community
  ('00000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', 'member',   now() - interval '4 months'),
  -- Marcus: member of career changers
  ('00000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'member',   now() - interval '3 months'),
  -- Nathaniel (nnhaswell@gmail.com): champion of Founders in Transition + member of others
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'champion', now() - interval '1 month'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member',   now() - interval '1 month'),
  ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member',   now() - interval '1 month')
ON CONFLICT (group_id, user_id) DO NOTHING;

-- ── Group Posts ───────────────────────────────────────────────────────────────

INSERT INTO public.group_posts (group_id, author_id, season, type, text, likes, created_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'past',    'post', 'First post! Welcome everyone to this community. 👋', 12, now() - interval '3 months'),
  ('00000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'present', 'post', 'Hit a new PR today. Feeling strong! 💪',            8,  now() - interval '2 weeks'),
  ('00000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', 'past',    'post', '6 months post-transplant. Grateful every day.',     15, now() - interval '1 month'),
  ('00000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'future',  'post', 'Just gave notice at my old job. Scared but excited!', 5,  now() - interval '1 week')
ON CONFLICT DO NOTHING;

-- ── Posts (personal timeline posts, not group posts) ──────────────────────────

INSERT INTO public.posts (author_id, user_id, season, content, created_at) VALUES
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'past',    'Reflecting on my startup journey. Hard but worth it.', now() - interval '2 months'),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'present', 'Loving the PM role. Design + strategy = perfect fit.', now() - interval '3 weeks'),
  ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'past',    'My last game was 6 months ago. Ready for whats next.', now() - interval '2 months'),
  ('55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 'present', 'Shipped a carbon calculator today. Feels good!',       now() - interval '1 week')
ON CONFLICT DO NOTHING;
