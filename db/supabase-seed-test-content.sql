-- Demo content seed for the C3K app.
-- Apply after db/schema.sql.
--
-- Seeds:
-- - 12 artists
-- - 60 listeners
-- - 108 releases with real remote media URLs
-- - 30 editorial/news posts
-- - blog comments/reactions
-- - follow graph, purchases, NFT upgrade markers, release reactions/comments
-- - showcase collections, promo codes, donations and subscriptions
--
-- The script is intended to be rerunnable. It upserts seed rows and rewrites
-- the seed segment inside app_state keys while preserving unrelated data.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '0';

CREATE TEMP TABLE seed_meta ON COMMIT DROP AS
SELECT
  now() AS seed_now,
  current_date AS seed_date,
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now_iso,
  coalesce(
    nullif((SELECT payload ->> 'collectionAddress' FROM app_state WHERE key = 'ton_runtime_config_v1' LIMIT 1), ''),
    'kQCZHa0l-osWuvUKby3C4ExQhqGRrayIkKJcYWcxqHwium57'
  ) AS demo_collection_address;

CREATE TEMP TABLE seed_artists ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (1, 910000001::bigint, 'nova_field', 'Nova', 'Field', 'nova-field', 'NOVA FIELD', 'Night-drive ambient techno from Berlin, built out of tape hiss, soft kick drums and long station reverb.', 'https://picsum.photos/seed/nova-field-avatar/320/320', 'https://picsum.photos/seed/nova-field-cover/1600/900', 'ambient techno', 'Berlin', 490, 842000, 5423000),
    (2, 910000002::bigint, 'mira_vale', 'Mira', 'Vale', 'mira-vale', 'Mira Vale', 'Alt-pop electronica with close vocal stacks, broken club percussion and glossy midnight choruses.', 'https://picsum.photos/seed/mira-vale-avatar/320/320', 'https://picsum.photos/seed/mira-vale-cover/1600/900', 'alt pop electronica', 'Barcelona', 520, 765000, 4832000),
    (3, 910000003::bigint, 'oxide_garden', 'Oxide', 'Garden', 'oxide-garden', 'Oxide Garden', 'Industrial breaks and warehouse textures, always pushing rough edges into hooks.', 'https://picsum.photos/seed/oxide-garden-avatar/320/320', 'https://picsum.photos/seed/oxide-garden-cover/1600/900', 'industrial breaks', 'Warsaw', 430, 693000, 4215000),
    (4, 910000004::bigint, 'sora_lane', 'Sora', 'Lane', 'sora-lane', 'Sora Lane', 'Dream-pop synthwave written for small screens, long night walks and repeat listens.', 'https://picsum.photos/seed/sora-lane-avatar/320/320', 'https://picsum.photos/seed/sora-lane-cover/1600/900', 'dream pop synthwave', 'Seoul', 550, 918000, 6114000),
    (5, 910000005::bigint, 'static_coast', 'Static', 'Coast', 'static-coast', 'Static Coast', 'Downtempo house with salt-air ambience, clipped vocals and warm low-end movement.', 'https://picsum.photos/seed/static-coast-avatar/320/320', 'https://picsum.photos/seed/static-coast-cover/1600/900', 'downtempo house', 'Lisbon', 480, 704000, 4683000),
    (6, 910000006::bigint, 'luma_kid', 'Luma', 'Kid', 'luma-kid', 'Luma Kid', 'Hyperpop club sketches that stay melodic and surprisingly soft in headphones.', 'https://picsum.photos/seed/luma-kid-avatar/320/320', 'https://picsum.photos/seed/luma-kid-cover/1600/900', 'hyperpop club', 'London', 620, 982000, 6559000),
    (7, 910000007::bigint, 'atlas_phase', 'Atlas', 'Phase', 'atlas-phase', 'Atlas Phase', 'Leftfield techno from Tbilisi, focused on tension, restraint and very physical groove design.', 'https://picsum.photos/seed/atlas-phase-avatar/320/320', 'https://picsum.photos/seed/atlas-phase-cover/1600/900', 'leftfield techno', 'Tbilisi', 510, 811000, 5078000),
    (8, 910000008::bigint, 'violet_tape', 'Violet', 'Tape', 'violet-tape', 'Violet Tape', 'Lo-fi ambient loops, diary fragments and soft edits that feel half-remembered.', 'https://picsum.photos/seed/violet-tape-avatar/320/320', 'https://picsum.photos/seed/violet-tape-cover/1600/900', 'lofi ambient', 'Tokyo', 390, 558000, 3389000),
    (9, 910000009::bigint, 'north_silica', 'North', 'Silica', 'north-silica', 'North Silica', 'Coldwave electronics with precise drums, thin daylight melodies and quiet menace.', 'https://picsum.photos/seed/north-silica-avatar/320/320', 'https://picsum.photos/seed/north-silica-cover/1600/900', 'coldwave electronics', 'Helsinki', 470, 677000, 4121000),
    (10, 910000010::bigint, 'echo_district', 'Echo', 'District', 'echo-district', 'Echo District', 'House and soul hybrids made for movement, with bright pianos and rough club swing.', 'https://picsum.photos/seed/echo-district-avatar/320/320', 'https://picsum.photos/seed/echo-district-cover/1600/900', 'house soul', 'Chicago', 560, 936000, 6287000),
    (11, 910000011::bigint, 'rue_mono', 'Rue', 'Mono', 'rue-mono', 'Rue Mono', 'Minimal electro and voice-note songwriting, dry drums and sharp stereo detail.', 'https://picsum.photos/seed/rue-mono-avatar/320/320', 'https://picsum.photos/seed/rue-mono-cover/1600/900', 'minimal electro', 'Paris', 450, 624000, 3894000),
    (12, 910000012::bigint, 'polar_fade', 'Polar', 'Fade', 'polar-fade', 'Polar Fade', 'Glacial ambient from Reykjavik, all breath, distance and patient harmonic change.', 'https://picsum.photos/seed/polar-fade-avatar/320/320', 'https://picsum.photos/seed/polar-fade-cover/1600/900', 'glacial ambient', 'Reykjavik', 530, 873000, 5941000)
) AS artist(
  artist_index,
  telegram_user_id,
  username,
  first_name,
  last_name,
  slug,
  display_name,
  bio,
  avatar_url,
  cover_url,
  genre,
  hometown,
  subscription_price_stars_cents,
  balance_stars_cents,
  lifetime_earnings_stars_cents
);

CREATE TEMP TABLE seed_fans ON COMMIT DROP AS
WITH source AS (
  SELECT
    gs AS fan_index,
    (ARRAY['Alex','Mia','Noah','Lena','Ilya','Nora','Owen','Eva','Mark','Lia','Drew','Iris','Leo','Nika','Finn','Mila','Sean','Vera','Theo','Rina'])[((gs - 1) % 20) + 1] AS first_name,
    (ARRAY['Stone','Vale','North','Lane','Morris','Dune','Frost','Kade','Swift','Bennett','Rowe','Parker','Hayes','Lowell','Wren','Foley','Cole','Harper','Reed','Marlow'])[((gs * 3 - 1) % 20) + 1] AS last_name,
    (ARRAY['ambient','club','breaks','house','stems','vinyl rips','live sets','demo drops','collector editions','night mixes','field recordings','minimal cuts'])[((gs * 5 - 1) % 12) + 1] AS taste
  FROM generate_series(1, 60) AS gs
)
SELECT
  920000000 + fan_index AS telegram_user_id,
  fan_index,
  format('listener_%s', lpad(fan_index::text, 2, '0')) AS username,
  first_name,
  last_name,
  format('listener-%s', lpad(fan_index::text, 2, '0')) AS slug,
  format('%s %s', first_name, last_name) AS display_name,
  format('Collects %s, checks new drops daily and keeps the app feed busy with reactions and comments.', taste) AS bio,
  format('https://picsum.photos/seed/listener-%s-avatar/320/320', fan_index) AS avatar_url,
  format('https://picsum.photos/seed/listener-%s-cover/1600/900', fan_index) AS cover_url,
  taste,
  format('listener%s@c3k-demo.local', lpad(fan_index::text, 2, '0')) AS email,
  format('+7999000%s', lpad(fan_index::text, 4, '0')) AS phone
FROM source;

CREATE TEMP TABLE seed_users ON COMMIT DROP AS
SELECT
  artist.telegram_user_id,
  artist.username,
  artist.first_name,
  artist.last_name,
  format('%s@c3k-demo.local', replace(artist.username, '_', '.')) AS email,
  format('+7998000%s', lpad(artist.artist_index::text, 4, '0')) AS phone
FROM seed_artists AS artist
UNION ALL
SELECT
  fan.telegram_user_id,
  fan.username,
  fan.first_name,
  fan.last_name,
  fan.email,
  fan.phone
FROM seed_fans AS fan;

INSERT INTO users (
  telegram_user_id,
  username,
  first_name,
  last_name,
  phone,
  email,
  updated_at
)
SELECT
  seed.telegram_user_id,
  seed.username,
  seed.first_name,
  seed.last_name,
  seed.phone,
  seed.email,
  now()
FROM seed_users AS seed
ON CONFLICT (telegram_user_id)
DO UPDATE SET
  username = EXCLUDED.username,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  updated_at = now();

CREATE TEMP TABLE seed_category_defs ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('seed-music', 'Music', NULL::text, 'Seed audio releases and catalog groupings.', 10),
    ('seed-editorial', 'Editorial', NULL::text, 'News, studio notes and longform feed content.', 20),
    ('seed-collector', 'Collector', NULL::text, 'Rewards, upgrades and collector-facing materials.', 30)
) AS category(code, label, emoji, description, sort_order);

INSERT INTO categories (
  code,
  label,
  emoji,
  description,
  sort_order,
  updated_at
)
SELECT
  category.code,
  category.label,
  category.emoji,
  category.description,
  category.sort_order,
  now()
FROM seed_category_defs AS category
ON CONFLICT (code)
DO UPDATE SET
  label = EXCLUDED.label,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

CREATE TEMP TABLE seed_subcategory_defs ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('seed-music', 'seed-singles', 'Singles', 'Short one- and two-track drops.', 10),
    ('seed-music', 'seed-extended', 'Extended Plays', 'Four- to six-track packs.', 20),
    ('seed-music', 'seed-albums', 'Albums', 'Longform release bundles.', 30),
    ('seed-editorial', 'seed-news', 'News', 'Front-page news items.', 10),
    ('seed-editorial', 'seed-studio', 'Studio Notes', 'Process, breakdowns and making-of content.', 20),
    ('seed-collector', 'seed-upgrades', 'Upgrades', 'NFT upgrades, drops and collector notes.', 10),
    ('seed-collector', 'seed-rewards', 'Rewards', 'Badges, passes and supporter features.', 20)
) AS subcategory(category_code, code, label, description, sort_order);

INSERT INTO subcategories (
  category_id,
  code,
  label,
  description,
  sort_order,
  updated_at
)
SELECT
  category.id,
  subcategory.code,
  subcategory.label,
  subcategory.description,
  subcategory.sort_order,
  now()
FROM seed_subcategory_defs AS subcategory
JOIN categories AS category
  ON category.code = subcategory.category_code
ON CONFLICT (category_id, code)
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

CREATE TEMP TABLE seed_follow_edges ON COMMIT DROP AS
SELECT DISTINCT
  edge.follower_telegram_user_id,
  edge.followed_slug
FROM (
  SELECT
    fan.telegram_user_id AS follower_telegram_user_id,
    artist.slug AS followed_slug,
    fan.fan_index,
    row_number() OVER (
      PARTITION BY fan.telegram_user_id
      ORDER BY ((artist.artist_index * 11 + fan.fan_index * 7) % 97), artist.artist_index
    ) AS follow_rank
  FROM seed_fans AS fan
  CROSS JOIN seed_artists AS artist

  UNION ALL

  SELECT
    artist.telegram_user_id AS follower_telegram_user_id,
    other_artist.slug AS followed_slug,
    artist.artist_index AS fan_index,
    row_number() OVER (
      PARTITION BY artist.telegram_user_id
      ORDER BY ((artist.artist_index * 5 + other_artist.artist_index * 3) % 29), other_artist.artist_index
    ) AS follow_rank
  FROM seed_artists AS artist
  JOIN seed_artists AS other_artist
    ON other_artist.artist_index <> artist.artist_index

  UNION ALL

  SELECT
    fan.telegram_user_id AS follower_telegram_user_id,
    other_fan.slug AS followed_slug,
    fan.fan_index,
    row_number() OVER (
      PARTITION BY fan.telegram_user_id
      ORDER BY ((fan.fan_index * 13 + other_fan.fan_index * 9) % 211), other_fan.fan_index
    ) AS follow_rank
  FROM seed_fans AS fan
  JOIN seed_fans AS other_fan
    ON other_fan.fan_index <> fan.fan_index
) AS edge
WHERE
  (edge.follower_telegram_user_id BETWEEN 920000001 AND 920000060 AND edge.follow_rank <= 4 + (edge.fan_index % 3))
  OR (edge.follower_telegram_user_id BETWEEN 910000001 AND 910000012 AND edge.follow_rank <= 2)
  OR (edge.follower_telegram_user_id BETWEEN 920000001 AND 920000060 AND edge.followed_slug LIKE 'listener-%' AND edge.follow_rank <= 1 + (edge.fan_index % 2));

CREATE TEMP TABLE seed_releases ON COMMIT DROP AS
WITH lexicon AS (
  SELECT
    ARRAY['neon','quiet','solar','velvet','ghost','mirage','afterglow','static','silver','blue','dawn','night','echo','hollow','liquid','polar']::text[] AS adjectives,
    ARRAY['archive','transit','memory','signal','current','ritual','room','drift','system','garden','phase','district','tape','motion','broadcast','prism']::text[] AS nouns
),
base AS (
  SELECT
    artist.artist_index,
    artist.telegram_user_id,
    artist.slug,
    artist.display_name,
    artist.genre,
    artist.hometown,
    release_no,
    row_number() OVER (ORDER BY artist.artist_index, release_no) AS release_order,
    CASE
      WHEN release_no IN (1, 4, 7) THEN 'single'
      WHEN release_no IN (2, 5, 8) THEN 'ep'
      ELSE 'album'
    END AS release_type,
    CASE
      WHEN release_no IN (1, 4, 7) THEN 1 + ((artist.artist_index + release_no) % 2)
      WHEN release_no IN (2, 5, 8) THEN 4 + ((artist.artist_index + release_no) % 2)
      ELSE 7 + ((artist.artist_index + release_no) % 3)
    END AS track_count
  FROM seed_artists AS artist
  CROSS JOIN generate_series(1, 9) AS release_no
),
prepared AS (
  SELECT
    format('seed-track-%s-%s', base.slug, lpad(base.release_no::text, 2, '0')) AS track_id,
    format(
      '%s-%s-%s-%s',
      base.slug,
      lower(lexicon.adjectives[((base.release_order - 1) % array_length(lexicon.adjectives, 1)) + 1]),
      lower(lexicon.nouns[((base.release_order * 2 - 1) % array_length(lexicon.nouns, 1)) + 1]),
      lpad(base.release_no::text, 2, '0')
    ) AS slug,
    base.telegram_user_id AS artist_telegram_user_id,
    base.artist_index,
    base.slug AS artist_slug,
    base.display_name AS artist_name,
    initcap(base.genre) AS genre,
    base.hometown,
    base.release_no,
    base.release_order,
    base.release_type,
    base.track_count,
    initcap(lexicon.adjectives[((base.release_order - 1) % array_length(lexicon.adjectives, 1)) + 1]) AS title_left,
    initcap(lexicon.nouns[((base.release_order * 2 - 1) % array_length(lexicon.nouns, 1)) + 1]) AS title_right,
    lower(lexicon.adjectives[((base.release_order * 3 - 1) % array_length(lexicon.adjectives, 1)) + 1]) AS motion_word,
    CASE
      WHEN base.release_order % 3 = 0 THEN 'OGG'
      WHEN base.release_order % 2 = 0 THEN 'WAV'
      ELSE 'MP3'
    END AS default_format,
    CASE
      WHEN base.release_type = 'single' THEN 180 + base.release_order * 5
      WHEN base.release_type = 'ep' THEN 360 + base.release_order * 7
      ELSE 690 + base.release_order * 9
    END AS price_stars_cents,
    (SELECT seed_now - ((base.release_order * 9) || ' hours')::interval FROM seed_meta) AS published_at,
    (SELECT to_char((seed_now - ((base.release_order * 9) || ' hours')::interval) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM seed_meta) AS published_at_iso,
    (SELECT to_char((seed_now - ((base.release_order * 9 + 3) || ' hours')::interval) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM seed_meta) AS created_at_iso,
    (SELECT now_iso FROM seed_meta) AS updated_at_iso
  FROM base
  CROSS JOIN lexicon
)
SELECT
  prepared.track_id,
  prepared.slug,
  prepared.artist_telegram_user_id,
  prepared.artist_index,
  prepared.artist_slug,
  prepared.artist_name,
  prepared.genre,
  prepared.hometown,
  prepared.release_no,
  prepared.release_order,
  prepared.release_type,
  prepared.track_count,
  prepared.title_left || ' ' || prepared.title_right AS title,
  format('%s from %s with %s tracks', initcap(prepared.release_type), prepared.hometown, prepared.track_count) AS subtitle,
  format('%s turns %s into a %s release built for late listening, collector upgrades and heavy replay inside the app. %s %s keeps the mix tactile, portable and easy to share.', prepared.artist_name, lower(prepared.genre), prepared.release_type, prepared.title_left, prepared.title_right) AS description,
  format('https://picsum.photos/seed/%s-release-cover/1400/1400', prepared.slug) AS cover_image,
  ARRAY[
    lower(prepared.release_type),
    lower(regexp_replace(lower(prepared.genre), '[^a-z0-9]+', '-', 'g')),
    lower(regexp_replace(lower(prepared.hometown), '[^a-z0-9]+', '-', 'g')),
    prepared.motion_word,
    'culture-free'
  ]::text[] AS tags,
  CASE
    WHEN prepared.default_format = 'WAV' THEN 'https://samplelib.com/lib/preview/wav/sample-12s.wav'
    WHEN prepared.default_format = 'OGG' THEN 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg'
    ELSE 'https://samplelib.com/lib/preview/mp3/sample-12s.mp3'
  END AS preview_url,
  CASE
    WHEN prepared.default_format = 'WAV' THEN 'https://samplelib.com/lib/preview/wav/sample-12s.wav'
    WHEN prepared.default_format = 'OGG' THEN 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg'
    ELSE 'https://samplelib.com/lib/preview/mp3/sample-12s.mp3'
  END AS audio_file_id,
  prepared.price_stars_cents,
  0::integer AS sales_count,
  (420 + prepared.release_order * 31)::integer AS plays_count,
  prepared.published_at,
  prepared.published_at_iso,
  prepared.created_at_iso,
  prepared.updated_at_iso,
  (
    SELECT sum(110 + track_no * 24 + prepared.release_no * 9 + prepared.artist_index * 5)::integer
    FROM generate_series(1, prepared.track_count) AS track_no
  ) AS duration_sec,
  (
    SELECT jsonb_agg(format_row.payload ORDER BY format_row.sort_order)
    FROM (
      VALUES
        (
          1,
          jsonb_build_object(
            'format', 'mp3',
            'audioFileId', format('https://samplelib.com/lib/preview/mp3/sample-%ss.mp3', CASE WHEN prepared.release_order % 4 = 0 THEN 15 WHEN prepared.release_order % 3 = 0 THEN 9 WHEN prepared.release_order % 2 = 0 THEN 6 ELSE 3 END),
            'priceStarsCents', prepared.price_stars_cents,
            'label', 'MP3',
            'isDefault', prepared.default_format = 'MP3'
          )
        ),
        (
          2,
          jsonb_build_object(
            'format', 'wav',
            'audioFileId', format('https://samplelib.com/lib/preview/wav/sample-%ss.wav', CASE WHEN prepared.release_order % 4 = 0 THEN 15 WHEN prepared.release_order % 3 = 0 THEN 9 WHEN prepared.release_order % 2 = 0 THEN 6 ELSE 3 END),
            'priceStarsCents', prepared.price_stars_cents + CASE WHEN prepared.release_type = 'album' THEN 190 WHEN prepared.release_type = 'ep' THEN 110 ELSE 70 END,
            'label', 'WAV',
            'isDefault', prepared.default_format = 'WAV'
          )
        ),
        (
          3,
          CASE
            WHEN prepared.release_order % 3 = 0 THEN
              jsonb_build_object(
                'format', 'ogg',
                'audioFileId', 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg',
                'priceStarsCents', greatest(1, prepared.price_stars_cents - 20),
                'label', 'OGG',
                'isDefault', prepared.default_format = 'OGG'
              )
            ELSE NULL
          END
        )
    ) AS format_row(sort_order, payload)
    WHERE format_row.payload IS NOT NULL
  ) AS formats,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', format('track-%s', track_no),
        'title',
          CASE
            WHEN track_no = 1 THEN prepared.title_left || ' Intro'
            WHEN track_no = prepared.track_count THEN prepared.title_right || ' Reprise'
            ELSE initcap(
              (ARRAY['platform','afterlight','slow room','mirror hall','signal path','low tide','night shift','red window','soft exit','subway bloom','black cable','north stair'])[((track_no + prepared.release_order - 1) % 12) + 1]
            )
          END,
        'durationSec', 110 + track_no * 24 + prepared.release_no * 9 + prepared.artist_index * 5,
        'previewUrl',
          CASE
            WHEN (track_no + prepared.release_order) % 5 = 0 THEN 'https://samplelib.com/lib/preview/wav/sample-15s.wav'
            WHEN (track_no + prepared.release_order) % 4 = 0 THEN 'https://samplelib.com/lib/preview/mp3/sample-15s.mp3'
            WHEN (track_no + prepared.release_order) % 3 = 0 THEN 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg'
            WHEN (track_no + prepared.release_order) % 2 = 0 THEN 'https://samplelib.com/lib/preview/wav/sample-6s.wav'
            ELSE 'https://samplelib.com/lib/preview/mp3/sample-6s.mp3'
          END,
        'position', track_no
      )
      ORDER BY track_no
    )
    FROM generate_series(1, prepared.track_count) AS track_no
  ) AS release_tracklist
FROM prepared;

CREATE TEMP TABLE seed_fan_purchases ON COMMIT DROP AS
SELECT
  ranked.fan_index,
  ranked.telegram_user_id,
  ranked.release_slug,
  ranked.track_id,
  ranked.track_count,
  ranked.purchase_rank
FROM (
  SELECT
    fan.fan_index,
    fan.telegram_user_id,
    release.slug AS release_slug,
    release.track_id,
    release.track_count,
    row_number() OVER (
      PARTITION BY fan.telegram_user_id
      ORDER BY ((release.release_order * 17 + fan.fan_index * 11) % 173), release.release_order, release.track_id
    ) AS purchase_rank
  FROM seed_fans AS fan
  JOIN seed_follow_edges AS edge
    ON edge.follower_telegram_user_id = fan.telegram_user_id
  JOIN seed_artists AS artist
    ON artist.slug = edge.followed_slug
  JOIN seed_releases AS release
    ON release.artist_telegram_user_id = artist.telegram_user_id
) AS ranked
WHERE ranked.purchase_rank <= 5 + (ranked.fan_index % 4);

UPDATE seed_releases AS release
SET
  sales_count = counts.sales_count,
  plays_count = greatest(release.plays_count, counts.sales_count * (18 + (release.release_order % 9)))
FROM (
  SELECT
    purchase.release_slug,
    count(*)::integer AS sales_count
  FROM seed_fan_purchases AS purchase
  GROUP BY purchase.release_slug
) AS counts
WHERE counts.release_slug = release.slug;

CREATE TEMP TABLE seed_showcase_collections ON COMMIT DROP AS
SELECT
  'seed-showcase-fresh-arrivals' AS id,
  'Fresh arrivals' AS title,
  'Latest releases across the network' AS subtitle,
  'A front-page stack of the newest music currently seeded into the app.' AS description,
  'https://picsum.photos/seed/showcase-fresh-arrivals/1600/900' AS cover_image,
  10 AS sort_order,
  true AS is_published,
  '[]'::jsonb AS product_ids,
  (
    SELECT jsonb_agg(release.track_id ORDER BY release.published_at DESC)
    FROM (
      SELECT track_id, published_at
      FROM seed_releases
      ORDER BY published_at DESC
      LIMIT 18
    ) AS release
  ) AS track_ids
UNION ALL
SELECT
  'seed-showcase-night-traffic',
  'Night traffic',
  'For late trains, empty bridges and phone speakers',
  'A slower selection centered on ambient, coldwave and long-tail motion.',
  'https://picsum.photos/seed/showcase-night-traffic/1600/900',
  20,
  true,
  '[]'::jsonb,
  (
    SELECT jsonb_agg(release.track_id ORDER BY release.published_at DESC)
    FROM (
      SELECT track_id, published_at
      FROM seed_releases
      WHERE lower(genre) IN ('ambient techno', 'lofi ambient', 'glacial ambient', 'coldwave electronics')
      ORDER BY published_at DESC
      LIMIT 16
    ) AS release
  )
UNION ALL
SELECT
  'seed-showcase-club-pressure',
  'Club pressure',
  'Louder cuts with more push',
  'Warehouse-leaning singles and EPs that keep the market page feeling alive.',
  'https://picsum.photos/seed/showcase-club-pressure/1600/900',
  30,
  true,
  '[]'::jsonb,
  (
    SELECT jsonb_agg(release.track_id ORDER BY release.sales_count DESC, release.published_at DESC)
    FROM (
      SELECT track_id, sales_count, published_at
      FROM seed_releases
      WHERE lower(genre) IN ('industrial breaks', 'leftfield techno', 'hyperpop club', 'house soul', 'minimal electro')
      ORDER BY sales_count DESC, published_at DESC
      LIMIT 16
    ) AS release
  )
UNION ALL
SELECT
  'seed-showcase-longform',
  'Longform albums',
  'Wide releases with deeper tracklists',
  'Album-format releases that make the app feel full from the first scroll.',
  'https://picsum.photos/seed/showcase-longform/1600/900',
  40,
  true,
  '[]'::jsonb,
  (
    SELECT jsonb_agg(release.track_id ORDER BY release.sales_count DESC, release.published_at DESC)
    FROM (
      SELECT track_id, sales_count, published_at
      FROM seed_releases
      WHERE release_type = 'album'
      ORDER BY sales_count DESC, published_at DESC
      LIMIT 18
    ) AS release
  )
UNION ALL
SELECT
  'seed-showcase-collector-picks',
  'Collector picks',
  'Higher-conviction releases with upgrade potential',
  'A sales-ranked selection meant to make the collector layer feel active.',
  'https://picsum.photos/seed/showcase-collector-picks/1600/900',
  50,
  true,
  '[]'::jsonb,
  (
    SELECT jsonb_agg(release.track_id ORDER BY release.sales_count DESC, release.published_at DESC)
    FROM (
      SELECT track_id, sales_count, published_at
      FROM seed_releases
      ORDER BY sales_count DESC, published_at DESC
      LIMIT 18
    ) AS release
  );

CREATE TEMP TABLE seed_artist_donations ON COMMIT DROP AS
SELECT
  format('seed-don-%s', lpad(row_number() OVER (ORDER BY fan.fan_index)::text, 3, '0')) AS id,
  artist.telegram_user_id AS artist_telegram_user_id,
  fan.telegram_user_id AS from_telegram_user_id,
  (120 + ((fan.fan_index + artist.artist_index) % 7) * 40)::integer AS amount_stars_cents,
  format('Picked up the latest release and sent a tip to %s.', artist.display_name) AS message,
  to_char(
    ((SELECT seed_now FROM seed_meta) - ((fan.fan_index + artist.artist_index) || ' days')::interval) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS created_at_iso
FROM seed_fans AS fan
JOIN seed_artists AS artist
  ON ((fan.fan_index * 7 + artist.artist_index * 5) % 19) = 0;

CREATE TEMP TABLE seed_artist_subscriptions ON COMMIT DROP AS
SELECT
  format('seed-sub-%s', lpad(row_number() OVER (ORDER BY fan.fan_index, artist.artist_index)::text, 3, '0')) AS id,
  artist.telegram_user_id AS artist_telegram_user_id,
  fan.telegram_user_id AS subscriber_telegram_user_id,
  artist.subscription_price_stars_cents AS amount_stars_cents,
  CASE
    WHEN (fan.fan_index + artist.artist_index) % 11 = 0 THEN 'cancelled'
    WHEN (fan.fan_index + artist.artist_index) % 7 = 0 THEN 'paused'
    ELSE 'active'
  END AS status,
  to_char(
    ((SELECT seed_now FROM seed_meta) - ((fan.fan_index + artist.artist_index + 14) || ' days')::interval) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS started_at_iso,
  to_char(
    ((SELECT seed_now FROM seed_meta) - ((fan.fan_index + artist.artist_index) || ' days')::interval) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS updated_at_iso
FROM seed_fans AS fan
JOIN seed_artists AS artist
  ON ((fan.fan_index * 13 + artist.artist_index * 3) % 23) = 0;

CREATE TEMP TABLE seed_posts ON COMMIT DROP AS
WITH lexicon AS (
  SELECT
    ARRAY['night shift','collector notes','release anatomy','studio diary','mix map','drop guide','scene memo','playlist sketch','design log','signal report']::text[] AS themes,
    ARRAY['headphones','arrangement','community','cover art','queue flow','mobile listening','collector layer','track order','support loop','story card']::text[] AS focuses
)
SELECT
  post_number,
  author.telegram_user_id AS author_telegram_user_id,
  author.display_name AS author_name,
  author.slug AS author_slug,
  format(
    'dispatch-%s-%s',
    lpad(post_number::text, 2, '0'),
    replace(lexicon.themes[((post_number - 1) % array_length(lexicon.themes, 1)) + 1], ' ', '-')
  ) AS slug,
  initcap(lexicon.themes[((post_number - 1) % array_length(lexicon.themes, 1)) + 1]) || ' / ' || initcap(lexicon.focuses[((post_number * 2 - 1) % array_length(lexicon.focuses, 1)) + 1]) AS title,
  format(
    'A short editorial note on how %s turns %s into releases, posts and repeat interaction inside the app.',
    author.display_name,
    lexicon.focuses[((post_number * 2 - 1) % array_length(lexicon.focuses, 1)) + 1]
  ) AS excerpt,
  ARRAY[
    'news',
    replace(lexicon.themes[((post_number - 1) % array_length(lexicon.themes, 1)) + 1], ' ', '-'),
    author.slug
  ]::text[] AS tags,
  CASE
    WHEN post_number % 3 = 0 THEN 'feature'
    WHEN post_number % 2 = 0 THEN 'glass'
    ELSE 'minimal'
  END AS card_variant,
  format('%s min', 4 + (post_number % 6)) AS read_time,
  ((SELECT seed_date FROM seed_meta) - (post_number * 2)) AS published_at,
  jsonb_build_object(
    'src', format('https://picsum.photos/seed/%s-post-cover/1600/900', author.slug || '-' || post_number),
    'alt', format('%s cover', author.display_name),
    'caption', format('Editorial frame for %s', author.display_name),
    'width', 1600,
    'height', 900
  ) AS cover_json,
  (
    jsonb_build_array(
      jsonb_build_object('type', 'heading', 'text', initcap(lexicon.themes[((post_number - 1) % array_length(lexicon.themes, 1)) + 1])),
      jsonb_build_object(
        'type', 'paragraph',
        'text',
        format(
          '%s uses the app as a living release room: short notes, instant reactions, buyer profiles and a collector layer that makes each drop feel persistent.',
          author.display_name
        )
      ),
      jsonb_build_object(
        'type', 'quote',
        'text',
        'A release page should feel alive before the first purchase and even stronger after it.',
        'author',
        author.display_name
      ),
      jsonb_build_object(
        'type', 'image',
        'image',
        jsonb_build_object(
          'src', format('https://picsum.photos/seed/%s-post-still/1200/900', author.slug || '-' || post_number),
          'alt', format('%s still frame', author.display_name),
          'caption', 'Still frame from the editorial package.',
          'width', 1200,
          'height', 900
        )
      ),
      jsonb_build_object(
        'type', 'list',
        'ordered', false,
        'items',
        to_jsonb(
          ARRAY[
            'Keep the release header compact and clear.',
            'Tie reactions to real people and visible comments.',
            'Make upgrades feel like a meaningful collector step.'
          ]::text[]
        )
      )
    )
    || CASE
      WHEN post_number % 2 = 0 THEN
        jsonb_build_array(
          jsonb_build_object(
            'type', 'audio',
            'audio',
            jsonb_build_object(
              'src', CASE WHEN post_number % 4 = 0 THEN 'https://samplelib.com/lib/preview/wav/sample-9s.wav' ELSE 'https://samplelib.com/lib/preview/mp3/sample-9s.mp3' END,
              'title', format('%s editorial preview', author.display_name),
              'caption', 'A short editorial audio preview embedded in the post.'
            )
          )
        )
      ELSE '[]'::jsonb
    END
    || CASE
      WHEN post_number % 3 = 0 THEN
        jsonb_build_array(
          jsonb_build_object(
            'type', 'gallery',
            'title', 'Moodboard',
            'images',
            jsonb_build_array(
              jsonb_build_object('src', format('https://picsum.photos/seed/%s-gallery-a/1200/900', author.slug || '-' || post_number), 'alt', 'Gallery frame A', 'width', 1200, 'height', 900),
              jsonb_build_object('src', format('https://picsum.photos/seed/%s-gallery-b/1200/900', author.slug || '-' || post_number), 'alt', 'Gallery frame B', 'width', 1200, 'height', 900),
              jsonb_build_object('src', format('https://picsum.photos/seed/%s-gallery-c/1200/900', author.slug || '-' || post_number), 'alt', 'Gallery frame C', 'width', 1200, 'height', 900)
            )
          )
        )
      ELSE '[]'::jsonb
    END
    || CASE
      WHEN post_number % 4 = 0 THEN
        jsonb_build_array(
          jsonb_build_object(
            'type', 'video',
            'video',
            jsonb_build_object(
              'src', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
              'poster', format('https://picsum.photos/seed/%s-video-poster/1200/900', author.slug || '-' || post_number),
              'caption', 'Looped motion study for the story card.'
            )
          )
        )
      ELSE '[]'::jsonb
    END
    || CASE
      WHEN post_number % 5 = 0 THEN
        jsonb_build_array(
          jsonb_build_object(
            'type', 'model3d',
            'model',
            jsonb_build_object(
              'src', 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
              'poster', format('https://picsum.photos/seed/%s-model-poster/1200/900', author.slug || '-' || post_number),
              'alt', '3D editorial object',
              'caption', 'A 3D object used to make the post feel richer.'
            )
          )
        )
      ELSE '[]'::jsonb
    END
    || CASE
      WHEN post_number % 6 = 0 THEN
        jsonb_build_array(
          jsonb_build_object(
            'type', 'tsx',
            'title', 'Theme chip',
            'code', 'export function ThemeChip(){ return <button className="chip">Preview</button>; }',
            'demoId', 'theme-chip'
          )
        )
      ELSE '[]'::jsonb
    END
    || CASE
      WHEN post_number % 7 = 0 THEN
        jsonb_build_array(
          jsonb_build_object(
            'type', 'animation',
            'title', 'Pulse grid',
            'caption', 'Motion study for the feed card.',
            'demoId', 'pulse-grid'
          )
        )
      ELSE '[]'::jsonb
    END
  ) AS content_json
FROM generate_series(1, 30) AS post_number
JOIN seed_artists AS author
  ON author.artist_index = ((post_number - 1) % 12) + 1
CROSS JOIN lexicon;

INSERT INTO blog_posts (
  slug,
  title,
  excerpt,
  cover,
  tags,
  content,
  published_at,
  is_hidden,
  author_user_id,
  updated_at
)
SELECT
  post.slug,
  post.title,
  post.excerpt,
  post.cover_json || jsonb_build_object('cardVariant', post.card_variant, 'readTime', post.read_time),
  post.tags,
  post.content_json,
  post.published_at,
  false,
  author_user.id,
  now()
FROM seed_posts AS post
LEFT JOIN users AS author_user
  ON author_user.telegram_user_id = post.author_telegram_user_id
ON CONFLICT (slug)
DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  cover = EXCLUDED.cover,
  tags = EXCLUDED.tags,
  content = EXCLUDED.content,
  published_at = EXCLUDED.published_at,
  is_hidden = EXCLUDED.is_hidden,
  author_user_id = EXCLUDED.author_user_id,
  updated_at = now();

DELETE FROM post_reactions
WHERE post_id IN (
  SELECT blog.id
  FROM blog_posts AS blog
  JOIN seed_posts AS post
    ON post.slug = blog.slug
);

DELETE FROM post_comments
WHERE post_id IN (
  SELECT blog.id
  FROM blog_posts AS blog
  JOIN seed_posts AS post
    ON post.slug = blog.slug
);

CREATE TEMP TABLE seed_post_comments ON COMMIT DROP AS
SELECT
  blog.id AS post_id,
  fan_user.id AS user_id,
  format(
    '%s reads clean on mobile. The section about %s should probably stay visible on the feed card too.',
    post.title,
    replace(post.author_slug, '-', ' ')
  ) AS body,
  ((SELECT seed_now FROM seed_meta) - ((post.post_number * 3 + comment_idx * 5) || ' hours')::interval) AS created_at
FROM seed_posts AS post
JOIN blog_posts AS blog
  ON blog.slug = post.slug
CROSS JOIN LATERAL generate_series(1, 2 + (post.post_number % 3)) AS comment_idx
JOIN seed_fans AS fan
  ON fan.fan_index = ((post.post_number * 7 + comment_idx * 11) % 60) + 1
JOIN users AS fan_user
  ON fan_user.telegram_user_id = fan.telegram_user_id;

INSERT INTO post_comments (
  post_id,
  user_id,
  body,
  is_deleted,
  created_at,
  updated_at
)
SELECT
  comment.post_id,
  comment.user_id,
  comment.body,
  false,
  comment.created_at,
  comment.created_at
FROM seed_post_comments AS comment;

CREATE TEMP TABLE seed_post_reactions ON COMMIT DROP AS
SELECT DISTINCT
  blog.id AS post_id,
  fan_user.id AS user_id,
  (ARRAY['like','fire','wow','idea'])[((post.post_number + reaction_idx - 1) % 4) + 1] AS reaction_type,
  ((SELECT seed_now FROM seed_meta) - ((post.post_number * 2 + reaction_idx) || ' hours')::interval) AS reacted_at
FROM seed_posts AS post
JOIN blog_posts AS blog
  ON blog.slug = post.slug
CROSS JOIN LATERAL generate_series(1, 8 + (post.post_number % 5)) AS reaction_idx
JOIN seed_fans AS fan
  ON fan.fan_index = ((post.post_number * 11 + reaction_idx * 3) % 60) + 1
JOIN users AS fan_user
  ON fan_user.telegram_user_id = fan.telegram_user_id;

INSERT INTO post_reactions (
  post_id,
  user_id,
  reaction_type,
  created_at,
  updated_at
)
SELECT
  reaction.post_id,
  reaction.user_id,
  reaction.reaction_type,
  reaction.reacted_at,
  reaction.reacted_at
FROM seed_post_reactions AS reaction
ON CONFLICT (post_id, user_id)
DO UPDATE SET
  reaction_type = EXCLUDED.reaction_type,
  updated_at = EXCLUDED.updated_at;

CREATE TEMP TABLE seed_release_reactions ON COMMIT DROP AS
SELECT
  purchase.release_slug,
  purchase.telegram_user_id,
  (ARRAY['like','fire','wow','idea'])[((purchase.fan_index + release.release_order - 1) % 4) + 1] AS reaction_type
FROM seed_fan_purchases AS purchase
JOIN seed_releases AS release
  ON release.slug = purchase.release_slug;

CREATE TEMP TABLE seed_release_comments ON COMMIT DROP AS
SELECT
  ranked.release_slug,
  format('seed-release-comment-%s-%s', release.release_order, ranked.release_comment_rank) AS comment_id,
  format(
    '%s has been sitting in my queue all week. The pacing stays strong and the collector upgrade angle makes the release feel more permanent.',
    release.title
  ) AS body,
  to_char(
    ((SELECT seed_now FROM seed_meta) - ((release.release_order * 2 + ranked.release_comment_rank) || ' hours')::interval) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS created_at_iso,
  fan.telegram_user_id,
  fan.username,
  fan.first_name,
  fan.last_name,
  fan.avatar_url
FROM (
  SELECT
    purchase.release_slug,
    purchase.telegram_user_id,
    purchase.fan_index,
    row_number() OVER (
      PARTITION BY purchase.release_slug
      ORDER BY purchase.purchase_rank, purchase.fan_index
    ) AS release_comment_rank
  FROM seed_fan_purchases AS purchase
) AS ranked
JOIN seed_releases AS release
  ON release.slug = ranked.release_slug
JOIN seed_fans AS fan
  ON fan.telegram_user_id = ranked.telegram_user_id
WHERE ranked.release_comment_rank <= 1 + (release.release_order % 3);

CREATE TEMP TABLE seed_fan_track_unlocks ON COMMIT DROP AS
SELECT
  purchase.telegram_user_id,
  purchase.fan_index,
  format('%s::track-1', purchase.release_slug) AS track_key,
  purchase.purchase_rank AS sort_order
FROM seed_fan_purchases AS purchase
UNION ALL
SELECT
  purchase.telegram_user_id,
  purchase.fan_index,
  format('%s::track-2', purchase.release_slug) AS track_key,
  purchase.purchase_rank + 100 AS sort_order
FROM seed_fan_purchases AS purchase
WHERE purchase.track_count > 3
  AND purchase.purchase_rank % 2 = 0
UNION ALL
SELECT
  purchase.telegram_user_id,
  purchase.fan_index,
  format('%s::track-3', purchase.release_slug) AS track_key,
  purchase.purchase_rank + 200 AS sort_order
FROM seed_fan_purchases AS purchase
WHERE purchase.track_count > 6
  AND purchase.fan_index % 5 = 0;

CREATE TEMP TABLE seed_minted_nfts ON COMMIT DROP AS
SELECT
  minted.telegram_user_id,
  minted.release_slug,
  format('seed-nft-%s-%s', minted.telegram_user_id, lpad(minted.mint_rank::text, 2, '0')) AS nft_id,
  format('seed-wallet-%s', minted.telegram_user_id) AS owner_address,
  (SELECT demo_collection_address FROM seed_meta) AS collection_address,
  (SELECT demo_collection_address FROM seed_meta) AS item_address,
  (1000 + row_number() OVER (ORDER BY minted.telegram_user_id, minted.mint_rank))::text AS item_index,
  format('seed-mint-%s-%s', minted.telegram_user_id, replace(minted.release_slug, '-', '')) AS tx_hash,
  to_char(
    ((SELECT seed_now FROM seed_meta) - ((minted.fan_index + minted.mint_rank) || ' days')::interval) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS minted_at_iso
FROM (
  SELECT
    purchase.*,
    row_number() OVER (
      PARTITION BY purchase.telegram_user_id
      ORDER BY purchase.purchase_rank
    ) AS mint_rank
  FROM seed_fan_purchases AS purchase
  WHERE purchase.fan_index <= 24
) AS minted
WHERE minted.mint_rank <= 1 + (minted.fan_index % 3);

CREATE TEMP TABLE seed_promos ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('SEEDWELCOME', 'Welcome credit', 'percent', 15, 0, true, 5000, 124, NULL::text),
    ('NIGHTSHIFT', 'Night shift discount', 'percent', 20, 300, true, 2000, 77, NULL::text),
    ('COLLECTOR10', 'Collector upgrade push', 'fixed', 100, 600, true, 1200, 48, NULL::text),
    ('LONGFORM25', 'Longform bundle', 'percent', 25, 900, true, 800, 35, NULL::text),
    ('DIRECTSUPPORT', 'Direct support week', 'percent', 12, 200, true, 1500, 59, NULL::text)
) AS promo(code, label, discount_type, discount_value, min_subtotal_stars_cents, active, usage_limit, used_count, expires_at);

-- Payload fragments and app_state merges follow below.

CREATE TEMP TABLE seed_social_profiles ON COMMIT DROP AS
SELECT
  artist.telegram_user_id::text AS user_key,
  artist.telegram_user_id,
  artist.slug,
  artist.display_name,
  artist.username,
  artist.avatar_url,
  artist.cover_url,
  artist.bio
FROM seed_artists AS artist
UNION ALL
SELECT
  fan.telegram_user_id::text AS user_key,
  fan.telegram_user_id,
  fan.slug,
  fan.display_name,
  fan.username,
  fan.avatar_url,
  fan.cover_url,
  fan.bio
FROM seed_fans AS fan;

CREATE TEMP TABLE seed_artist_follow_counts ON COMMIT DROP AS
SELECT
  artist.telegram_user_id,
  count(edge.followed_slug)::integer AS followers_count
FROM seed_artists AS artist
LEFT JOIN seed_follow_edges AS edge
  ON edge.followed_slug = artist.slug
GROUP BY artist.telegram_user_id;

CREATE TEMP TABLE seed_shop_artist_profile_records ON COMMIT DROP AS
SELECT
  artist.telegram_user_id::text AS key,
  jsonb_build_object(
    'telegramUserId', artist.telegram_user_id,
    'slug', artist.slug,
    'displayName', artist.display_name,
    'bio', artist.bio,
    'avatarUrl', artist.avatar_url,
    'coverUrl', artist.cover_url,
    'status', 'approved',
    'donationEnabled', true,
    'subscriptionEnabled', true,
    'subscriptionPriceStarsCents', artist.subscription_price_stars_cents,
    'balanceStarsCents', artist.balance_stars_cents,
    'lifetimeEarningsStarsCents', artist.lifetime_earnings_stars_cents,
    'followersCount', coalesce(followers.followers_count, 0),
    'createdAt', to_char((((SELECT seed_now FROM seed_meta) - ((artist.artist_index * 33) || ' days')::interval) AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ) AS payload
FROM seed_artists AS artist
LEFT JOIN seed_artist_follow_counts AS followers
  ON followers.telegram_user_id = artist.telegram_user_id;

CREATE TEMP TABLE seed_shop_artist_track_records ON COMMIT DROP AS
SELECT
  release.track_id AS key,
  jsonb_build_object(
    'id', release.track_id,
    'slug', release.slug,
    'artistTelegramUserId', release.artist_telegram_user_id,
    'title', release.title,
    'releaseType', release.release_type,
    'subtitle', release.subtitle,
    'description', release.description,
    'coverImage', release.cover_image,
    'formats', release.formats,
    'releaseTracklist', release.release_tracklist,
    'audioFileId', release.audio_file_id,
    'previewUrl', release.preview_url,
    'durationSec', release.duration_sec,
    'genre', release.genre,
    'tags', release.tags,
    'priceStarsCents', release.price_stars_cents,
    'status', 'published',
    'playsCount', release.plays_count,
    'salesCount', release.sales_count,
    'createdAt', release.created_at_iso,
    'updatedAt', release.updated_at_iso,
    'publishedAt', release.published_at_iso
  ) AS payload
FROM seed_releases AS release;

CREATE TEMP TABLE seed_shop_product_records ON COMMIT DROP AS
SELECT
  release.track_id AS key,
  jsonb_strip_nulls(
    jsonb_build_object(
      'id', release.track_id,
      'slug', release.slug,
      'title', release.title,
      'subtitle', release.subtitle,
      'description', release.description,
      'category', 'music',
      'image', release.cover_image,
      'priceStarsCents', release.price_stars_cents,
      'oldPriceStarsCents', CASE WHEN release.release_order % 5 = 0 THEN release.price_stars_cents + 120 ELSE NULL END,
      'rating', round((4.20 + least(release.sales_count, 140)::numeric / 100)::numeric, 2),
      'reviewsCount', release.sales_count,
      'isNew', release.release_order <= 24,
      'isHit', release.sales_count >= 7,
      'tags', release.tags,
      'attributes', jsonb_build_object(
        'material', 'Digital',
        'technique', 'Audio',
        'color', 'N/A',
        'heightCm', 1,
        'widthCm', 1,
        'weightGr', 1,
        'collection', release.genre,
        'sku', upper(left(release.track_id, 60)),
        'stock', 9999
      )
    )
  ) AS payload
FROM seed_releases AS release;

CREATE TEMP TABLE seed_shop_product_override_records ON COMMIT DROP AS
SELECT
  release.track_id AS key,
  jsonb_strip_nulls(
    jsonb_build_object(
      'productId', release.track_id,
      'priceStarsCents', release.price_stars_cents,
      'stock', 9999,
      'isPublished', true,
      'isFeatured', (release.release_order % 6 = 0 OR release.sales_count >= 9),
      'badge',
        CASE
          WHEN release.release_type = 'album' THEN 'Album'
          WHEN release.release_order % 5 = 0 THEN 'Collector cut'
          WHEN release.release_order % 3 = 0 THEN 'NFT-ready'
          ELSE NULL
        END,
      'updatedAt', (SELECT now_iso FROM seed_meta)
    )
  ) AS payload
FROM seed_releases AS release;

CREATE TEMP TABLE seed_shop_showcase_payloads ON COMMIT DROP AS
SELECT
  jsonb_build_object(
    'id', showcase.id,
    'title', showcase.title,
    'subtitle', showcase.subtitle,
    'description', showcase.description,
    'coverImage', showcase.cover_image,
    'productIds', showcase.product_ids,
    'trackIds', showcase.track_ids,
    'order', showcase.sort_order,
    'isPublished', showcase.is_published
  ) AS payload
FROM seed_showcase_collections AS showcase;

CREATE TEMP TABLE seed_shop_donation_payloads ON COMMIT DROP AS
SELECT
  jsonb_build_object(
    'id', donation.id,
    'artistTelegramUserId', donation.artist_telegram_user_id,
    'fromTelegramUserId', donation.from_telegram_user_id,
    'amountStarsCents', donation.amount_stars_cents,
    'message', donation.message,
    'createdAt', donation.created_at_iso
  ) AS payload
FROM seed_artist_donations AS donation;

CREATE TEMP TABLE seed_shop_subscription_payloads ON COMMIT DROP AS
SELECT
  jsonb_build_object(
    'id', subscription.id,
    'artistTelegramUserId', subscription.artist_telegram_user_id,
    'subscriberTelegramUserId', subscription.subscriber_telegram_user_id,
    'amountStarsCents', subscription.amount_stars_cents,
    'status', subscription.status,
    'startedAt', subscription.started_at_iso,
    'updatedAt', subscription.updated_at_iso
  ) AS payload
FROM seed_artist_subscriptions AS subscription;

CREATE TEMP TABLE seed_shop_blog_post_records ON COMMIT DROP AS
SELECT
  post.slug AS key,
  jsonb_build_object(
    'slug', post.slug,
    'title', post.title,
    'excerpt', post.excerpt,
    'tags', post.tags,
    'cardVariant', post.card_variant,
    'publishedAt', post.published_at::text,
    'readTime', post.read_time,
    'cover', post.cover_json,
    'content', post.content_json
  ) AS payload
FROM seed_posts AS post;

CREATE TEMP TABLE seed_shop_promo_payloads ON COMMIT DROP AS
SELECT
  jsonb_strip_nulls(
    jsonb_build_object(
      'code', promo.code,
      'label', promo.label,
      'discountType', promo.discount_type,
      'discountValue', promo.discount_value,
      'minSubtotalStarsCents', promo.min_subtotal_stars_cents,
      'active', promo.active,
      'usageLimit', promo.usage_limit,
      'usedCount', promo.used_count,
      'expiresAt', promo.expires_at,
      'createdAt', (SELECT now_iso FROM seed_meta),
      'updatedAt', (SELECT now_iso FROM seed_meta)
    )
  ) AS payload
FROM seed_promos AS promo;

CREATE TEMP TABLE seed_shop_product_category_payloads ON COMMIT DROP AS
SELECT
  jsonb_build_object(
    'id', 'seed-music',
    'label', 'Music',
    'description', 'Seed catalog category for digital releases.',
    'order', 10,
    'subcategories', jsonb_build_array(
      jsonb_build_object('id', 'seed-singles', 'label', 'Singles', 'description', 'One- and two-track drops.', 'order', 10),
      jsonb_build_object('id', 'seed-extended', 'label', 'Extended Plays', 'description', 'Four- to six-track bundles.', 'order', 20),
      jsonb_build_object('id', 'seed-albums', 'label', 'Albums', 'description', 'Longform releases.', 'order', 30)
    )
  ) AS payload
UNION ALL
SELECT
  jsonb_build_object(
    'id', 'seed-editorial',
    'label', 'Editorial',
    'description', 'Feed and newsroom groupings.',
    'order', 20,
    'subcategories', jsonb_build_array(
      jsonb_build_object('id', 'seed-news', 'label', 'News', 'description', 'Front-page news items.', 'order', 10),
      jsonb_build_object('id', 'seed-studio', 'label', 'Studio Notes', 'description', 'Process and making-of coverage.', 'order', 20)
    )
  )
UNION ALL
SELECT
  jsonb_build_object(
    'id', 'seed-collector',
    'label', 'Collector',
    'description', 'Upgrade and rewards grouping.',
    'order', 30,
    'subcategories', jsonb_build_array(
      jsonb_build_object('id', 'seed-upgrades', 'label', 'Upgrades', 'description', 'NFT upgrade paths.', 'order', 10),
      jsonb_build_object('id', 'seed-rewards', 'label', 'Rewards', 'description', 'Badges and supporter perks.', 'order', 20)
    )
  );

CREATE TEMP TABLE seed_follow_profile_records ON COMMIT DROP AS
SELECT
  profile.user_key,
  profile.slug AS key,
  jsonb_build_object(
    'slug', profile.slug,
    'displayName', profile.display_name,
    'username', profile.username,
    'avatarUrl', profile.avatar_url,
    'coverUrl', profile.cover_url,
    'bio', profile.bio,
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ) AS payload
FROM seed_social_profiles AS profile;

CREATE TEMP TABLE seed_slug_by_user_records ON COMMIT DROP AS
SELECT
  profile.user_key AS key,
  to_jsonb(profile.slug) AS payload
FROM seed_social_profiles AS profile;

CREATE TEMP TABLE seed_following_records ON COMMIT DROP AS
SELECT
  edge.follower_telegram_user_id::text AS key,
  jsonb_agg(edge.followed_slug ORDER BY edge.followed_slug) AS payload
FROM seed_follow_edges AS edge
GROUP BY edge.follower_telegram_user_id;

CREATE TEMP TABLE seed_social_wallet_records ON COMMIT DROP AS
SELECT
  artist.telegram_user_id::text AS key,
  artist.balance_stars_cents AS wallet_cents
FROM seed_artists AS artist
UNION ALL
SELECT
  fan.telegram_user_id::text AS key,
  (2400 + fan.fan_index * 210) AS wallet_cents
FROM seed_fans AS fan;

CREATE TEMP TABLE seed_social_visibility_records ON COMMIT DROP AS
SELECT
  profile.user_key AS key,
  true AS visible
FROM seed_social_profiles AS profile;

CREATE TEMP TABLE seed_social_purchase_records ON COMMIT DROP AS
SELECT
  purchase.telegram_user_id::text AS key,
  jsonb_agg(purchase.release_slug ORDER BY purchase.purchase_rank) AS payload
FROM seed_fan_purchases AS purchase
GROUP BY purchase.telegram_user_id;

CREATE TEMP TABLE seed_social_track_purchase_records ON COMMIT DROP AS
SELECT
  unlock.telegram_user_id::text AS key,
  jsonb_agg(unlock.track_key ORDER BY unlock.sort_order) AS payload
FROM seed_fan_track_unlocks AS unlock
GROUP BY unlock.telegram_user_id;

CREATE TEMP TABLE seed_social_wallet_address_records ON COMMIT DROP AS
SELECT DISTINCT
  nft.telegram_user_id::text AS key,
  nft.owner_address AS address
FROM seed_minted_nfts AS nft;

CREATE TEMP TABLE seed_social_minted_records ON COMMIT DROP AS
SELECT
  nft.telegram_user_id::text AS key,
  jsonb_agg(
    jsonb_build_object(
      'id', nft.nft_id,
      'releaseSlug', nft.release_slug,
      'ownerAddress', nft.owner_address,
      'collectionAddress', nft.collection_address,
      'itemAddress', nft.item_address,
      'itemIndex', nft.item_index,
      'txHash', nft.tx_hash,
      'mintedAt', nft.minted_at_iso,
      'status', 'minted'
    )
    ORDER BY nft.minted_at_iso DESC
  ) AS payload
FROM seed_minted_nfts AS nft
GROUP BY nft.telegram_user_id;

CREATE TEMP TABLE seed_social_redeemed_promo_records ON COMMIT DROP AS
WITH promo_lists AS (
  SELECT
    fan.telegram_user_id::text AS key,
    array_remove(
      ARRAY[
        CASE WHEN fan.fan_index % 2 = 0 THEN 'SEEDWELCOME' ELSE NULL END,
        CASE WHEN fan.fan_index % 5 = 0 THEN 'NIGHTSHIFT' ELSE NULL END,
        CASE WHEN fan.fan_index % 7 = 0 THEN 'COLLECTOR10' ELSE NULL END
      ]::text[],
      NULL
    ) AS promo_codes
  FROM seed_fans AS fan
  WHERE fan.fan_index <= 28
)
SELECT
  promo_list.key,
  to_jsonb(promo_list.promo_codes) AS payload
FROM promo_lists AS promo_list
WHERE cardinality(promo_list.promo_codes) > 0;

CREATE TEMP TABLE seed_release_social_records ON COMMIT DROP AS
WITH reaction_maps AS (
  SELECT
    reaction.release_slug,
    jsonb_object_agg(reaction.telegram_user_id::text, reaction.reaction_type) AS reacted_users
  FROM seed_release_reactions AS reaction
  GROUP BY reaction.release_slug
),
comment_maps AS (
  SELECT
    comment.release_slug,
    jsonb_agg(
      jsonb_build_object(
        'id', comment.comment_id,
        'releaseSlug', comment.release_slug,
        'text', comment.body,
        'createdAt', comment.created_at_iso,
        'updatedAt', comment.created_at_iso,
        'author', jsonb_build_object(
          'telegramUserId', comment.telegram_user_id,
          'username', comment.username,
          'firstName', comment.first_name,
          'lastName', comment.last_name,
          'photoUrl', comment.avatar_url
        )
      )
      ORDER BY comment.created_at_iso
    ) AS comments
  FROM seed_release_comments AS comment
  GROUP BY comment.release_slug
)
SELECT
  release.slug AS key,
  jsonb_build_object(
    'releaseSlug', release.slug,
    'reactedUsers', coalesce(reactions.reacted_users, '{}'::jsonb),
    'comments', coalesce(comments.comments, '[]'::jsonb),
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ) AS payload
FROM seed_releases AS release
LEFT JOIN reaction_maps AS reactions
  ON reactions.release_slug = release.slug
LEFT JOIN comment_maps AS comments
  ON comments.release_slug = release.slug;

WITH existing AS (
  SELECT coalesce((SELECT payload FROM app_state WHERE key = 'shop_admin_config_v1' LIMIT 1), '{}'::jsonb) AS payload
),
seed AS (
  SELECT
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_shop_artist_profile_records AS record), '{}'::jsonb) AS artist_profiles,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_shop_artist_track_records AS record), '{}'::jsonb) AS artist_tracks,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_shop_product_records AS record), '{}'::jsonb) AS product_records,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_shop_product_override_records AS record), '{}'::jsonb) AS product_overrides,
    coalesce((SELECT jsonb_agg(record.payload ORDER BY (record.payload ->> 'order')::integer) FROM seed_shop_showcase_payloads AS record), '[]'::jsonb) AS showcase_collections,
    coalesce((SELECT jsonb_agg(record.payload) FROM seed_shop_donation_payloads AS record), '[]'::jsonb) AS artist_donations,
    coalesce((SELECT jsonb_agg(record.payload) FROM seed_shop_subscription_payloads AS record), '[]'::jsonb) AS artist_subscriptions,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_shop_blog_post_records AS record), '{}'::jsonb) AS blog_post_records,
    coalesce((SELECT jsonb_agg(record.payload ORDER BY (record.payload ->> 'order')::integer) FROM seed_shop_product_category_payloads AS record), '[]'::jsonb) AS product_categories,
    coalesce((SELECT jsonb_agg(record.payload) FROM seed_shop_promo_payloads AS record), '[]'::jsonb) AS promo_codes
),
preserved_admin_members AS (
  SELECT coalesce(existing.payload -> 'adminMembers', '[]'::jsonb) AS data
  FROM existing
),
preserved_product_records AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'productRecords', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_shop_product_records AS record
        WHERE record.key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_product_overrides AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'productOverrides', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_shop_product_override_records AS record
        WHERE record.key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_product_categories AS (
  SELECT coalesce(
    (
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(coalesce(existing.payload -> 'productCategories', '[]'::jsonb)) AS item
      WHERE coalesce(item ->> 'id', '') NOT LIKE 'seed-%'
    ),
    '[]'::jsonb
  ) AS data
  FROM existing
),
preserved_artist_profiles AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'artistProfiles', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_shop_artist_profile_records AS record
        WHERE record.key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_artist_tracks AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'artistTracks', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_shop_artist_track_records AS record
        WHERE record.key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_showcase_collections AS (
  SELECT coalesce(
    (
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(coalesce(existing.payload -> 'showcaseCollections', '[]'::jsonb)) AS item
      WHERE coalesce(item ->> 'id', '') NOT LIKE 'seed-showcase-%'
    ),
    '[]'::jsonb
  ) AS data
  FROM existing
),
preserved_artist_donations AS (
  SELECT coalesce(
    (
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(coalesce(existing.payload -> 'artistDonations', '[]'::jsonb)) AS item
      WHERE coalesce(item ->> 'id', '') NOT LIKE 'seed-don-%'
    ),
    '[]'::jsonb
  ) AS data
  FROM existing
),
preserved_artist_subscriptions AS (
  SELECT coalesce(
    (
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(coalesce(existing.payload -> 'artistSubscriptions', '[]'::jsonb)) AS item
      WHERE coalesce(item ->> 'id', '') NOT LIKE 'seed-sub-%'
    ),
    '[]'::jsonb
  ) AS data
  FROM existing
),
preserved_blog_post_records AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'blogPostRecords', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_shop_blog_post_records AS record
        WHERE record.key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_hidden_post_slugs AS (
  SELECT coalesce(
    (
      SELECT jsonb_agg(slug_value)
      FROM jsonb_array_elements_text(coalesce(existing.payload -> 'hiddenPostSlugs', '[]'::jsonb)) AS slug_value
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_posts AS post
        WHERE post.slug = slug_value
      )
    ),
    '[]'::jsonb
  ) AS data
  FROM existing
),
preserved_promo_codes AS (
  SELECT coalesce(
    (
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(coalesce(existing.payload -> 'promoCodes', '[]'::jsonb)) AS item
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_promos AS promo
        WHERE upper(coalesce(item ->> 'code', '')) = promo.code
      )
    ),
    '[]'::jsonb
  ) AS data
  FROM existing
),
resolved_settings AS (
  SELECT jsonb_build_object(
    'shopEnabled', coalesce((existing.payload -> 'settings' ->> 'shopEnabled')::boolean, true),
    'checkoutEnabled', coalesce((existing.payload -> 'settings' ->> 'checkoutEnabled')::boolean, true),
    'maintenanceMode', coalesce((existing.payload -> 'settings' ->> 'maintenanceMode')::boolean, false),
    'defaultDeliveryFeeStarsCents', coalesce((existing.payload -> 'settings' ->> 'defaultDeliveryFeeStarsCents')::integer, 0),
    'freeDeliveryThresholdStarsCents', coalesce((existing.payload -> 'settings' ->> 'freeDeliveryThresholdStarsCents')::integer, 0),
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ) AS data
  FROM existing
)
INSERT INTO app_state (key, payload, row_version, updated_at)
SELECT
  'shop_admin_config_v1',
  jsonb_build_object(
    'adminMembers', preserved_admin_members.data,
    'productRecords', preserved_product_records.data || seed.product_records,
    'productOverrides', preserved_product_overrides.data || seed.product_overrides,
    'productCategories', preserved_product_categories.data || seed.product_categories,
    'artistProfiles', preserved_artist_profiles.data || seed.artist_profiles,
    'artistTracks', preserved_artist_tracks.data || seed.artist_tracks,
    'showcaseCollections', preserved_showcase_collections.data || seed.showcase_collections,
    'artistDonations', preserved_artist_donations.data || seed.artist_donations,
    'artistSubscriptions', preserved_artist_subscriptions.data || seed.artist_subscriptions,
    'blogPostRecords', preserved_blog_post_records.data || seed.blog_post_records,
    'hiddenPostSlugs', preserved_hidden_post_slugs.data,
    'promoCodes', preserved_promo_codes.data || seed.promo_codes,
    'settings', resolved_settings.data,
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ),
  1,
  now()
FROM existing
CROSS JOIN seed
CROSS JOIN preserved_admin_members
CROSS JOIN preserved_product_records
CROSS JOIN preserved_product_overrides
CROSS JOIN preserved_product_categories
CROSS JOIN preserved_artist_profiles
CROSS JOIN preserved_artist_tracks
CROSS JOIN preserved_showcase_collections
CROSS JOIN preserved_artist_donations
CROSS JOIN preserved_artist_subscriptions
CROSS JOIN preserved_blog_post_records
CROSS JOIN preserved_hidden_post_slugs
CROSS JOIN preserved_promo_codes
CROSS JOIN resolved_settings
ON CONFLICT (key)
DO UPDATE SET
  payload = EXCLUDED.payload,
  row_version = app_state.row_version + 1,
  updated_at = now();

WITH existing AS (
  SELECT coalesce((SELECT payload FROM app_state WHERE key = 'social_follow_graph_v1' LIMIT 1), '{}'::jsonb) AS payload
),
seed AS (
  SELECT
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_following_records AS record), '{}'::jsonb) AS following_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_slug_by_user_records AS record), '{}'::jsonb) AS slug_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_follow_profile_records AS record), '{}'::jsonb) AS profiles_by_slug
),
preserved_following AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'followingByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_slug_by_user AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'slugByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_profiles AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'profilesBySlug', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.slug = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
)
INSERT INTO app_state (key, payload, row_version, updated_at)
SELECT
  'social_follow_graph_v1',
  jsonb_build_object(
    'followingByUserId', preserved_following.data || seed.following_by_user_id,
    'slugByUserId', preserved_slug_by_user.data || seed.slug_by_user_id,
    'profilesBySlug', preserved_profiles.data || seed.profiles_by_slug,
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ),
  1,
  now()
FROM existing
CROSS JOIN seed
CROSS JOIN preserved_following
CROSS JOIN preserved_slug_by_user
CROSS JOIN preserved_profiles
ON CONFLICT (key)
DO UPDATE SET
  payload = EXCLUDED.payload,
  row_version = app_state.row_version + 1,
  updated_at = now();

WITH existing AS (
  SELECT coalesce((SELECT payload FROM app_state WHERE key = 'social_user_state_v1' LIMIT 1), '{}'::jsonb) AS payload
),
seed AS (
  SELECT
    coalesce((SELECT jsonb_object_agg(record.key, record.wallet_cents) FROM seed_social_wallet_records AS record), '{}'::jsonb) AS wallet_cents_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, record.visible) FROM seed_social_visibility_records AS record), '{}'::jsonb) AS purchases_visible_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_social_purchase_records AS record), '{}'::jsonb) AS purchased_release_slugs_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_social_track_purchase_records AS record), '{}'::jsonb) AS purchased_track_keys_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_social_redeemed_promo_records AS record), '{}'::jsonb) AS redeemed_topup_promo_codes_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, to_jsonb(record.address)) FROM seed_social_wallet_address_records AS record), '{}'::jsonb) AS ton_wallet_address_by_user_id,
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_social_minted_records AS record), '{}'::jsonb) AS minted_release_nfts_by_user_id
),
preserved_wallets AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'walletCentsByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_visibility AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'purchasesVisibleByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_release_purchases AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'purchasedReleaseSlugsByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_track_purchases AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'purchasedTrackKeysByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_redeemed_promos AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'redeemedTopupPromoCodesByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_wallet_addresses AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'tonWalletAddressByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
),
preserved_minted AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'mintedReleaseNftsByUserId', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_social_profiles AS profile
        WHERE profile.user_key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
)
INSERT INTO app_state (key, payload, row_version, updated_at)
SELECT
  'social_user_state_v1',
  jsonb_build_object(
    'walletCentsByUserId', preserved_wallets.data || seed.wallet_cents_by_user_id,
    'purchasesVisibleByUserId', preserved_visibility.data || seed.purchases_visible_by_user_id,
    'purchasedReleaseSlugsByUserId', preserved_release_purchases.data || seed.purchased_release_slugs_by_user_id,
    'purchasedTrackKeysByUserId', preserved_track_purchases.data || seed.purchased_track_keys_by_user_id,
    'redeemedTopupPromoCodesByUserId', preserved_redeemed_promos.data || seed.redeemed_topup_promo_codes_by_user_id,
    'tonWalletAddressByUserId', preserved_wallet_addresses.data || seed.ton_wallet_address_by_user_id,
    'mintedReleaseNftsByUserId', preserved_minted.data || seed.minted_release_nfts_by_user_id,
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ),
  1,
  now()
FROM existing
CROSS JOIN seed
CROSS JOIN preserved_wallets
CROSS JOIN preserved_visibility
CROSS JOIN preserved_release_purchases
CROSS JOIN preserved_track_purchases
CROSS JOIN preserved_redeemed_promos
CROSS JOIN preserved_wallet_addresses
CROSS JOIN preserved_minted
ON CONFLICT (key)
DO UPDATE SET
  payload = EXCLUDED.payload,
  row_version = app_state.row_version + 1,
  updated_at = now();

WITH existing AS (
  SELECT coalesce((SELECT payload FROM app_state WHERE key = 'release_social_v1' LIMIT 1), '{}'::jsonb) AS payload
),
seed AS (
  SELECT
    coalesce((SELECT jsonb_object_agg(record.key, record.payload) FROM seed_release_social_records AS record), '{}'::jsonb) AS releases_by_slug
),
preserved_releases AS (
  SELECT coalesce(
    (
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(coalesce(existing.payload -> 'releasesBySlug', '{}'::jsonb)) AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM seed_release_social_records AS record
        WHERE record.key = entry.key
      )
    ),
    '{}'::jsonb
  ) AS data
  FROM existing
)
INSERT INTO app_state (key, payload, row_version, updated_at)
SELECT
  'release_social_v1',
  jsonb_build_object(
    'releasesBySlug', preserved_releases.data || seed.releases_by_slug,
    'updatedAt', (SELECT now_iso FROM seed_meta)
  ),
  1,
  now()
FROM existing
CROSS JOIN seed
CROSS JOIN preserved_releases
ON CONFLICT (key)
DO UPDATE SET
  payload = EXCLUDED.payload,
  row_version = app_state.row_version + 1,
  updated_at = now();

COMMIT;
