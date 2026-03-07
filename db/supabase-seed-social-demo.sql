-- C3K social demo seed for Supabase SQL Editor
-- Run after db/schema.sql and db/supabase-seed-test-content.sql
-- Idempotent: fully rewrites social app_state snapshots with demo data.

BEGIN;

DO $$
DECLARE
  v_now TEXT := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  -- Follow graph snapshot for profile/followers/following demo.
  PERFORM c3k_put_app_state(
    'social_follow_graph_v1',
    jsonb_build_object(
      'followingByUserId', jsonb_build_object(
        '1693883', jsonb_build_array('nova-glass', 'clayless'),
        '900000101', jsonb_build_array('culture3k', 'clayless'),
        '900000102', jsonb_build_array('culture3k'),
        '900000201', jsonb_build_array('culture3k', 'nova-glass'),
        '900000202', jsonb_build_array('culture3k', 'clayless')
      ),
      'slugByUserId', jsonb_build_object(
        '1693883', 'culture3k',
        '900000101', 'nova-glass',
        '900000102', 'clayless',
        '900000201', 'listener-max',
        '900000202', 'listener-ana'
      ),
      'profilesBySlug', jsonb_build_object(
        'culture3k', jsonb_build_object(
          'slug', 'culture3k',
          'displayName', 'Culture3k',
          'username', 'culture3k',
          'avatarUrl', 'https://images.unsplash.com/photo-1615109398623-88346a601842?auto=format&fit=crop&w=256&q=80',
          'coverUrl', 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1400&q=80',
          'bio', 'Основатель витрины и автор ambient/electro релизов.',
          'updatedAt', v_now
        ),
        'nova-glass', jsonb_build_object(
          'slug', 'nova-glass',
          'displayName', 'Nova Glass',
          'username', 'nova_glass',
          'avatarUrl', 'https://images.unsplash.com/photo-1542204625-de293a74f858?auto=format&fit=crop&w=256&q=80',
          'coverUrl', 'https://images.unsplash.com/photo-1460036521480-ff49c08c2781?auto=format&fit=crop&w=1400&q=80',
          'bio', 'Cinematic synth и liquid textures.',
          'updatedAt', v_now
        ),
        'clayless', jsonb_build_object(
          'slug', 'clayless',
          'displayName', 'Clayless',
          'username', 'clayless',
          'avatarUrl', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=256&q=80',
          'coverUrl', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80',
          'bio', 'Lo-fi и downtempo с жирным грувом.',
          'updatedAt', v_now
        ),
        'listener-max', jsonb_build_object(
          'slug', 'listener-max',
          'displayName', 'Max Volkov',
          'username', 'listener_max',
          'avatarUrl', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&q=80',
          'bio', 'Коллекционирую релизы и поддерживаю артистов.',
          'updatedAt', v_now
        ),
        'listener-ana', jsonb_build_object(
          'slug', 'listener-ana',
          'displayName', 'Ana Kovacs',
          'username', 'ana_listener',
          'avatarUrl', 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=256&q=80',
          'bio', 'Люблю искать новые релизы через социальную ленту.',
          'updatedAt', v_now
        )
      ),
      'updatedAt', v_now
    ),
    NULL
  );

  -- Wallet + purchases + promo usage snapshot for social profile/shop demo.
  PERFORM c3k_put_app_state(
    'social_user_state_v1',
    jsonb_build_object(
      'walletCentsByUserId', jsonb_build_object(
        '1693883', 3200,
        '900000101', 1540,
        '900000102', 1180,
        '900000201', 860,
        '900000202', 1240
      ),
      'purchasesVisibleByUserId', jsonb_build_object(
        '1693883', true,
        '900000101', true,
        '900000102', true,
        '900000201', true,
        '900000202', false
      ),
      'purchasedReleaseSlugsByUserId', jsonb_build_object(
        '1693883', jsonb_build_array('midnight-glass', 'neon-sand'),
        '900000101', jsonb_build_array('midnight-glass', 'telegram-signal'),
        '900000102', jsonb_build_array('liquid-window'),
        '900000201', jsonb_build_array('midnight-glass', 'liquid-window', 'shards'),
        '900000202', jsonb_build_array('telegram-signal', 'shards')
      ),
      'purchasedTrackKeysByUserId', jsonb_build_object(
        '1693883', jsonb_build_array('midnight-glass::track-1', 'neon-sand::track-1'),
        '900000101', jsonb_build_array('midnight-glass::track-1', 'telegram-signal::track-1'),
        '900000102', jsonb_build_array('liquid-window::track-1'),
        '900000201', jsonb_build_array('midnight-glass::track-1', 'liquid-window::track-1', 'shards::track-1'),
        '900000202', jsonb_build_array('telegram-signal::track-1', 'shards::track-1')
      ),
      'redeemedTopupPromoCodesByUserId', jsonb_build_object(
        '1693883', jsonb_build_array('SEED20'),
        '900000101', jsonb_build_array('WELCOME10'),
        '900000201', jsonb_build_array('SEED20'),
        '900000202', jsonb_build_array('START5')
      ),
      'updatedAt', v_now
    ),
    NULL
  );

  -- Release social snapshot for reactions/comments demo.
  PERFORM c3k_put_app_state(
    'release_social_v1',
    jsonb_build_object(
      'releasesBySlug', jsonb_build_object(
        'midnight-glass', jsonb_build_object(
          'releaseSlug', 'midnight-glass',
          'reactedUsers', jsonb_build_object(
            '900000201', 'like',
            '900000202', 'fire',
            '900000101', 'wow'
          ),
          'comments', jsonb_build_array(
            jsonb_build_object(
              'id', 'demo-midnight-1',
              'releaseSlug', 'midnight-glass',
              'text', 'Очень плотный вайб, отлично звучит в наушниках.',
              'createdAt', v_now,
              'updatedAt', v_now,
              'author', jsonb_build_object(
                'telegramUserId', 900000201,
                'username', 'listener_max',
                'firstName', 'Max',
                'lastName', 'Volkov',
                'photoUrl', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&q=80'
              )
            )
          ),
          'updatedAt', v_now
        ),
        'liquid-window', jsonb_build_object(
          'releaseSlug', 'liquid-window',
          'reactedUsers', jsonb_build_object(
            '900000201', 'idea',
            '900000202', 'like'
          ),
          'comments', jsonb_build_array(
            jsonb_build_object(
              'id', 'demo-liquid-1',
              'releaseSlug', 'liquid-window',
              'text', 'Хочется целый альбом в таком же стиле.',
              'createdAt', v_now,
              'updatedAt', v_now,
              'author', jsonb_build_object(
                'telegramUserId', 900000202,
                'username', 'ana_listener',
                'firstName', 'Ana',
                'lastName', 'Kovacs',
                'photoUrl', 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=256&q=80'
              )
            )
          ),
          'updatedAt', v_now
        )
      ),
      'updatedAt', v_now
    ),
    NULL
  );
END $$;

COMMIT;
