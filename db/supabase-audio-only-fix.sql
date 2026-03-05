-- C3K audio-only migration patch for Supabase SQL Editor
-- Safe to run multiple times.

BEGIN;

-- 1) Force digital-only delivery for all existing orders.
UPDATE orders
SET
  delivery_method = 'digital_download',
  delivery_fee_stars_cents = 0,
  address = COALESCE(NULLIF(address, ''), 'Digital download'),
  updated_at = NOW()
WHERE
  delivery_method IS DISTINCT FROM 'digital_download'
  OR delivery_fee_stars_cents <> 0
  OR COALESCE(NULLIF(address, ''), '') = '';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_method_check CHECK (delivery_method = 'digital_download');

-- 2) Keep only one category tree for audio catalog: music -> tracks.
INSERT INTO categories (code, label, emoji, description, sort_order)
VALUES ('music', 'Музыка', '🎵', 'Цифровые аудио-релизы', 10)
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH music_category AS (
  SELECT id FROM categories WHERE code = 'music' LIMIT 1
)
INSERT INTO subcategories (category_id, code, label, description, sort_order)
SELECT music_category.id, 'tracks', 'Треки', 'Digital-only релизы', 10
FROM music_category
ON CONFLICT (category_id, code) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 3) Remove legacy physical taxonomy.
DELETE FROM subcategories
WHERE category_id IN (SELECT id FROM categories WHERE code <> 'music');

DELETE FROM categories
WHERE code <> 'music';

-- 4) Mark legacy physical products unpublished.
-- If metadata.kind is missing, we treat row as legacy physical.
UPDATE products
SET
  is_published = FALSE,
  updated_at = NOW()
WHERE COALESCE(metadata ->> 'kind', 'physical') <> 'digital_track';

-- 5) Normalize remaining digital rows to the music/tracks taxonomy (optional but useful for admin views).
WITH music_category AS (
  SELECT id FROM categories WHERE code = 'music' LIMIT 1
),
tracks_subcategory AS (
  SELECT s.id
  FROM subcategories s
  JOIN music_category m ON m.id = s.category_id
  WHERE s.code = 'tracks'
  LIMIT 1
)
UPDATE products p
SET
  category_id = (SELECT id FROM music_category),
  subcategory_id = (SELECT id FROM tracks_subcategory),
  updated_at = NOW()
WHERE COALESCE(p.metadata ->> 'kind', 'physical') = 'digital_track';

-- 6) Align admin config payload defaults in app_state.
UPDATE app_state
SET
  payload = jsonb_set(
    jsonb_set(
      jsonb_set(
        payload,
        '{settings,defaultDeliveryFeeStarsCents}',
        '0'::jsonb,
        TRUE
      ),
      '{settings,freeDeliveryThresholdStarsCents}',
      '0'::jsonb,
      TRUE
    ),
    '{productCategories}',
    '[{"id":"music","label":"Музыка","emoji":"🎵","description":"Цифровые аудио-релизы","order":10,"subcategories":[{"id":"tracks","label":"Треки","description":"Digital-only релизы","order":10}]}]'::jsonb,
    TRUE
  ),
  updated_at = NOW()
WHERE key = 'shop_admin_config_v1';

COMMIT;
