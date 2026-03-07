-- C3K test content seed for Supabase SQL Editor
-- Purpose: quickly populate the app with demo artists, tracks, showcase and orders.
-- Safe to run multiple times (idempotent by keys/ids).

BEGIN;

-- Keep relational taxonomy aligned with audio-only mode (legacy admin endpoints may read these tables).
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

DO $$
DECLARE
  v_now_text TEXT := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_current JSONB;
  v_next JSONB;
  v_showcase JSONB;
  v_promos JSONB;
BEGIN
  INSERT INTO app_state(key, payload, row_version, updated_at)
  VALUES ('shop_admin_config_v1', '{}'::jsonb, 1, NOW())
  ON CONFLICT (key) DO NOTHING;

  SELECT payload INTO v_current
  FROM app_state
  WHERE key = 'shop_admin_config_v1'
  LIMIT 1;

  v_next := COALESCE(v_current, '{}'::jsonb);

  v_next := jsonb_set(
    v_next,
    '{settings}',
    COALESCE(v_next -> 'settings', '{}'::jsonb) || jsonb_build_object(
      'shopEnabled', TRUE,
      'checkoutEnabled', TRUE,
      'maintenanceMode', FALSE,
      'defaultDeliveryFeeStarsCents', 0,
      'freeDeliveryThresholdStarsCents', 0,
      'updatedAt', v_now_text
    ),
    TRUE
  );

  v_next := jsonb_set(
    v_next,
    '{productCategories}',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'music',
        'label', 'Музыка',
        'emoji', '🎵',
        'description', 'Цифровые аудио-релизы',
        'order', 10,
        'subcategories', jsonb_build_array(
          jsonb_build_object(
            'id', 'tracks',
            'label', 'Треки',
            'description', 'Digital-only релизы',
            'order', 10
          )
        )
      )
    ),
    TRUE
  );

  v_next := jsonb_set(
    v_next,
    '{artistProfiles}',
    COALESCE(v_next -> 'artistProfiles', '{}'::jsonb) || jsonb_build_object(
      '1693883',
      jsonb_build_object(
        'telegramUserId', 1693883,
        'slug', 'culture3k',
        'displayName', 'Culture3k',
        'bio', 'Основатель витрины. Электроника, ambient, mini app саунд-дизайн.',
        'avatarUrl', 'https://images.unsplash.com/photo-1615109398623-88346a601842?auto=format&fit=crop&w=256&q=80',
        'coverUrl', 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1400&q=80',
        'status', 'approved',
        'donationEnabled', TRUE,
        'subscriptionEnabled', TRUE,
        'subscriptionPriceStarsCents', 120,
        'balanceStarsCents', 1840,
        'lifetimeEarningsStarsCents', 9320,
        'followersCount', 421,
        'createdAt', v_now_text,
        'updatedAt', v_now_text
      ),
      '900000101',
      jsonb_build_object(
        'telegramUserId', 900000101,
        'slug', 'nova-glass',
        'displayName', 'Nova Glass',
        'bio', 'Cinematic synth и liquid textures.',
        'avatarUrl', 'https://images.unsplash.com/photo-1542204625-de293a74f858?auto=format&fit=crop&w=256&q=80',
        'coverUrl', 'https://images.unsplash.com/photo-1460036521480-ff49c08c2781?auto=format&fit=crop&w=1400&q=80',
        'status', 'approved',
        'donationEnabled', TRUE,
        'subscriptionEnabled', FALSE,
        'subscriptionPriceStarsCents', 90,
        'balanceStarsCents', 460,
        'lifetimeEarningsStarsCents', 2760,
        'followersCount', 172,
        'createdAt', v_now_text,
        'updatedAt', v_now_text
      ),
      '900000102',
      jsonb_build_object(
        'telegramUserId', 900000102,
        'slug', 'clayless',
        'displayName', 'Clayless',
        'bio', 'Lo-fi, downtempo и глубокий groove.',
        'avatarUrl', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=256&q=80',
        'coverUrl', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80',
        'status', 'approved',
        'donationEnabled', TRUE,
        'subscriptionEnabled', TRUE,
        'subscriptionPriceStarsCents', 80,
        'balanceStarsCents', 720,
        'lifetimeEarningsStarsCents', 3310,
        'followersCount', 219,
        'createdAt', v_now_text,
        'updatedAt', v_now_text
      )
    ),
    TRUE
  );

  v_next := jsonb_set(
    v_next,
    '{artistTracks}',
    COALESCE(v_next -> 'artistTracks', '{}'::jsonb) || jsonb_build_object(
      'c3k-midnight-glass',
      jsonb_build_object(
        'id', 'c3k-midnight-glass',
        'slug', 'midnight-glass',
        'artistTelegramUserId', 1693883,
        'title', 'Midnight Glass',
        'subtitle', 'Single',
        'description', 'Темный синтвейв с мягким low-end.',
        'coverImage', 'https://images.unsplash.com/photo-1505740106531-4243f3831c78?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoMIDGLASS',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        'durationSec', 196,
        'genre', 'Synthwave',
        'tags', jsonb_build_array('night', 'synth', 'c3k'),
        'priceStarsCents', 100,
        'status', 'published',
        'playsCount', 2200,
        'salesCount', 81,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      ),
      'c3k-neon-sand',
      jsonb_build_object(
        'id', 'c3k-neon-sand',
        'slug', 'neon-sand',
        'artistTelegramUserId', 1693883,
        'title', 'Neon Sand',
        'subtitle', 'EP cut',
        'description', 'Ритм с granular текстурами и плотным грувом.',
        'coverImage', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoNEONSAND',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        'durationSec', 224,
        'genre', 'Electro',
        'tags', jsonb_build_array('groove', 'electro'),
        'priceStarsCents', 120,
        'status', 'published',
        'playsCount', 1400,
        'salesCount', 47,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      ),
      'c3k-telegram-signal',
      jsonb_build_object(
        'id', 'c3k-telegram-signal',
        'slug', 'telegram-signal',
        'artistTelegramUserId', 1693883,
        'title', 'Telegram Signal',
        'subtitle', 'Mini App OST',
        'description', 'Тематический трек для Telegram Mini App.',
        'coverImage', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoTGSIGNAL',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        'durationSec', 181,
        'genre', 'Ambient',
        'tags', jsonb_build_array('telegram', 'ambient'),
        'priceStarsCents', 90,
        'status', 'published',
        'playsCount', 980,
        'salesCount', 36,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      ),
      'nova-liquid-window',
      jsonb_build_object(
        'id', 'nova-liquid-window',
        'slug', 'liquid-window',
        'artistTelegramUserId', 900000101,
        'title', 'Liquid Window',
        'subtitle', 'Single',
        'description', 'Кинематографичный синт с мягкими пэдами.',
        'coverImage', 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoLIQUIDWIN',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
        'durationSec', 238,
        'genre', 'Cinematic',
        'tags', jsonb_build_array('cinematic', 'synth'),
        'priceStarsCents', 150,
        'status', 'published',
        'playsCount', 860,
        'salesCount', 29,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      ),
      'nova-shards',
      jsonb_build_object(
        'id', 'nova-shards',
        'slug', 'shards',
        'artistTelegramUserId', 900000101,
        'title', 'Shards',
        'subtitle', 'Live edit',
        'description', 'Атмосферный трек с выразительной перкуссией.',
        'coverImage', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoSHARDS',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
        'durationSec', 210,
        'genre', 'Electronica',
        'tags', jsonb_build_array('live', 'electronica'),
        'priceStarsCents', 110,
        'status', 'published',
        'playsCount', 730,
        'salesCount', 24,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      ),
      'clayless-zero-kiln',
      jsonb_build_object(
        'id', 'clayless-zero-kiln',
        'slug', 'zero-kiln',
        'artistTelegramUserId', 900000102,
        'title', 'Zero Kiln',
        'subtitle', 'Downtempo',
        'description', 'Лоуфай трек для спокойного фона.',
        'coverImage', 'https://images.unsplash.com/photo-1445985543470-41fba5c3144a?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoZEROKILN',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
        'durationSec', 205,
        'genre', 'Lo-fi',
        'tags', jsonb_build_array('lofi', 'chill'),
        'priceStarsCents', 80,
        'status', 'published',
        'playsCount', 1500,
        'salesCount', 63,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      ),
      'clayless-soft-rhythm',
      jsonb_build_object(
        'id', 'clayless-soft-rhythm',
        'slug', 'soft-rhythm',
        'artistTelegramUserId', 900000102,
        'title', 'Soft Rhythm',
        'subtitle', 'Single',
        'description', 'Мягкий грув, теплый бас, deep mood.',
        'coverImage', 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoSOFTRHYTHM',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
        'durationSec', 188,
        'genre', 'Downtempo',
        'tags', jsonb_build_array('deep', 'downtempo'),
        'priceStarsCents', 95,
        'status', 'published',
        'playsCount', 1100,
        'salesCount', 44,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      ),
      'clayless-echo-market',
      jsonb_build_object(
        'id', 'clayless-echo-market',
        'slug', 'echo-market',
        'artistTelegramUserId', 900000102,
        'title', 'Echo Market',
        'subtitle', 'EP cut',
        'description', 'Экспериментальная электроника с tape эффектами.',
        'coverImage', 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=1200&q=80',
        'audioFileId', 'AQACAgIAAxkBAAIBq2demoECHOMARKET',
        'previewUrl', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
        'durationSec', 233,
        'genre', 'Experimental',
        'tags', jsonb_build_array('experimental', 'tape'),
        'priceStarsCents', 130,
        'status', 'published',
        'playsCount', 540,
        'salesCount', 19,
        'createdAt', v_now_text,
        'updatedAt', v_now_text,
        'publishedAt', v_now_text
      )
    ),
    TRUE
  );

  v_showcase := COALESCE(v_next -> 'showcaseCollections', '[]'::jsonb);
  v_showcase := (
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    FROM jsonb_array_elements(v_showcase) AS item
    WHERE COALESCE(item ->> 'id', '') NOT IN ('seed-new-tracks', 'seed-top-sales', 'seed-ambient')
  );

  v_showcase := v_showcase || jsonb_build_array(
    jsonb_build_object(
      'id', 'seed-new-tracks',
      'title', 'Новые релизы',
      'subtitle', 'Свежие треки недели',
      'description', 'Подборка новых цифровых релизов',
      'coverImage', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1400&q=80',
      'productIds', jsonb_build_array(),
      'trackIds', jsonb_build_array(
        'c3k-midnight-glass',
        'nova-liquid-window',
        'clayless-soft-rhythm',
        'c3k-telegram-signal'
      ),
      'order', 10,
      'isPublished', TRUE
    ),
    jsonb_build_object(
      'id', 'seed-top-sales',
      'title', 'Топ продаж',
      'subtitle', 'Что чаще покупают',
      'description', 'Самые продаваемые релизы',
      'coverImage', 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1400&q=80',
      'productIds', jsonb_build_array(),
      'trackIds', jsonb_build_array(
        'c3k-midnight-glass',
        'clayless-zero-kiln',
        'nova-shards'
      ),
      'order', 20,
      'isPublished', TRUE
    ),
    jsonb_build_object(
      'id', 'seed-ambient',
      'title', 'Ambient & Focus',
      'subtitle', 'Для концентрации и ночной работы',
      'description', 'Фоновая музыка для продуктивности',
      'coverImage', 'https://images.unsplash.com/photo-1445985543470-41fba5c3144a?auto=format&fit=crop&w=1400&q=80',
      'productIds', jsonb_build_array(),
      'trackIds', jsonb_build_array(
        'c3k-telegram-signal',
        'clayless-zero-kiln',
        'nova-liquid-window'
      ),
      'order', 30,
      'isPublished', TRUE
    )
  );

  v_next := jsonb_set(v_next, '{showcaseCollections}', v_showcase, TRUE);

  v_promos := COALESCE(v_next -> 'promoCodes', '[]'::jsonb);
  v_promos := (
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    FROM jsonb_array_elements(v_promos) AS item
    WHERE UPPER(COALESCE(item ->> 'code', '')) NOT IN ('SEED20', 'SEED50')
  );

  v_promos := v_promos || jsonb_build_array(
    jsonb_build_object(
      'code', 'SEED20',
      'label', 'Тест -20%',
      'discountType', 'percent',
      'discountValue', 20,
      'minSubtotalStarsCents', 100,
      'active', TRUE,
      'usedCount', 0,
      'createdAt', v_now_text,
      'updatedAt', v_now_text
    ),
    jsonb_build_object(
      'code', 'SEED50',
      'label', 'Тест -0.50⭐',
      'discountType', 'fixed',
      'discountValue', 50,
      'minSubtotalStarsCents', 200,
      'active', TRUE,
      'usedCount', 0,
      'createdAt', v_now_text,
      'updatedAt', v_now_text
    )
  );

  v_next := jsonb_set(v_next, '{promoCodes}', v_promos, TRUE);
  v_next := jsonb_set(v_next, '{updatedAt}', to_jsonb(v_now_text), TRUE);

  IF NOT (v_next ? 'adminMembers') THEN
    v_next := jsonb_set(v_next, '{adminMembers}', '[]'::jsonb, TRUE);
  END IF;
  IF NOT (v_next ? 'productRecords') THEN
    v_next := jsonb_set(v_next, '{productRecords}', '{}'::jsonb, TRUE);
  END IF;
  IF NOT (v_next ? 'productOverrides') THEN
    v_next := jsonb_set(v_next, '{productOverrides}', '{}'::jsonb, TRUE);
  END IF;
  IF NOT (v_next ? 'artistDonations') THEN
    v_next := jsonb_set(v_next, '{artistDonations}', '[]'::jsonb, TRUE);
  END IF;
  IF NOT (v_next ? 'artistSubscriptions') THEN
    v_next := jsonb_set(v_next, '{artistSubscriptions}', '[]'::jsonb, TRUE);
  END IF;
  IF NOT (v_next ? 'blogPostRecords') THEN
    v_next := jsonb_set(v_next, '{blogPostRecords}', '{}'::jsonb, TRUE);
  END IF;
  IF NOT (v_next ? 'hiddenPostSlugs') THEN
    v_next := jsonb_set(v_next, '{hiddenPostSlugs}', '[]'::jsonb, TRUE);
  END IF;

  UPDATE app_state
  SET
    payload = v_next,
    row_version = row_version + 1,
    updated_at = NOW()
  WHERE key = 'shop_admin_config_v1';
END $$;

-- Sample order #1: paid
SELECT * FROM c3k_upsert_order_snapshot(
  jsonb_build_object(
    'id', 'TST-A01',
    'createdAt', NOW() - INTERVAL '2 days',
    'updatedAt', NOW() - INTERVAL '1 day',
    'status', 'paid',
    'invoiceStars', 2,
    'totalStarsCents', 190,
    'deliveryFeeStarsCents', 0,
    'discountStarsCents', 0,
    'delivery', 'digital_download',
    'promoCode', 'SEED20',
    'address', 'Digital download',
    'customerName', 'Roman Smirnov',
    'phone', '+79990000001',
    'email', 'roman@example.com',
    'comment', 'Тестовый заказ: сразу оплачен',
    'telegramUserId', 1693883,
    'telegramUsername', 'culture3k',
    'telegramFirstName', 'Roman',
    'telegramLastName', 'Smirnov',
    'payment', jsonb_build_object(
      'currency', 'XTR',
      'amount', 2,
      'invoicePayloadHash', 'seed-hash-a01',
      'invoicePayload', 'order:TST-A01',
      'telegramPaymentChargeId', 'seed-charge-a01',
      'providerPaymentChargeId', 'seed-provider-a01',
      'status', 'paid',
      'updatedAt', NOW() - INTERVAL '1 day'
    ),
    'items', jsonb_build_array(
      jsonb_build_object(
        'productId', 'c3k-midnight-glass',
        'title', 'Midnight Glass',
        'quantity', 1,
        'priceStarsCents', 100
      ),
      jsonb_build_object(
        'productId', 'clayless-soft-rhythm',
        'title', 'Soft Rhythm',
        'quantity', 1,
        'priceStarsCents', 90
      )
    ),
    'history', jsonb_build_array(
      jsonb_build_object(
        'at', NOW() - INTERVAL '2 days',
        'fromStatus', NULL::TEXT,
        'toStatus', 'created',
        'actor', 'user',
        'actorTelegramId', 1693883,
        'note', 'Заказ создан'
      ),
      jsonb_build_object(
        'at', NOW() - INTERVAL '2 days' + INTERVAL '5 minute',
        'fromStatus', 'created',
        'toStatus', 'pending_payment',
        'actor', 'user',
        'actorTelegramId', 1693883,
        'note', 'Переход к оплате'
      ),
      jsonb_build_object(
        'at', NOW() - INTERVAL '1 day',
        'fromStatus', 'pending_payment',
        'toStatus', 'paid',
        'actor', 'bot',
        'note', 'Оплата подтверждена'
      )
    )
  ),
  NULL
);

-- Sample order #2: processing
SELECT * FROM c3k_upsert_order_snapshot(
  jsonb_build_object(
    'id', 'TST-B02',
    'createdAt', NOW() - INTERVAL '6 hours',
    'updatedAt', NOW() - INTERVAL '2 hours',
    'status', 'processing',
    'invoiceStars', 1,
    'totalStarsCents', 80,
    'deliveryFeeStarsCents', 0,
    'discountStarsCents', 0,
    'delivery', 'digital_download',
    'address', 'Digital download',
    'customerName', 'Demo Customer',
    'phone', '+79995550000',
    'email', 'demo.customer@example.com',
    'comment', 'Тестовый заказ: в обработке',
    'telegramUserId', 700000001,
    'telegramUsername', 'demo_user',
    'telegramFirstName', 'Demo',
    'telegramLastName', 'User',
    'payment', jsonb_build_object(
      'currency', 'XTR',
      'amount', 1,
      'invoicePayloadHash', 'seed-hash-b02',
      'invoicePayload', 'order:TST-B02',
      'telegramPaymentChargeId', 'seed-charge-b02',
      'providerPaymentChargeId', 'seed-provider-b02',
      'status', 'paid',
      'updatedAt', NOW() - INTERVAL '2 hours'
    ),
    'items', jsonb_build_array(
      jsonb_build_object(
        'productId', 'clayless-zero-kiln',
        'title', 'Zero Kiln',
        'quantity', 1,
        'priceStarsCents', 80
      )
    ),
    'history', jsonb_build_array(
      jsonb_build_object(
        'at', NOW() - INTERVAL '6 hours',
        'fromStatus', NULL::TEXT,
        'toStatus', 'created',
        'actor', 'user',
        'actorTelegramId', 700000001,
        'note', 'Создан тестовый заказ'
      ),
      jsonb_build_object(
        'at', NOW() - INTERVAL '5 hours',
        'fromStatus', 'created',
        'toStatus', 'pending_payment',
        'actor', 'user',
        'actorTelegramId', 700000001,
        'note', 'Открыт инвойс'
      ),
      jsonb_build_object(
        'at', NOW() - INTERVAL '2 hours',
        'fromStatus', 'pending_payment',
        'toStatus', 'paid',
        'actor', 'bot',
        'note', 'Оплата прошла'
      ),
      jsonb_build_object(
        'at', NOW() - INTERVAL '90 minutes',
        'fromStatus', 'paid',
        'toStatus', 'processing',
        'actor', 'admin',
        'actorTelegramId', 1693883,
        'note', 'Подготовка цифровой выдачи'
      )
    )
  ),
  NULL
);

COMMIT;
