-- C3K production schema baseline (PostgreSQL 15+)
-- Stage 2 foundation: transactional storage for shop/admin/blog/social.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  emoji TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subcategories (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, code)
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  product_code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id BIGINT REFERENCES subcategories(id) ON DELETE SET NULL,
  price_stars_cents INTEGER NOT NULL CHECK (price_stars_cents >= 0),
  old_price_stars_cents INTEGER CHECK (old_price_stars_cents IS NULL OR old_price_stars_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  invoice_stars INTEGER NOT NULL CHECK (invoice_stars >= 0),
  total_stars_cents INTEGER NOT NULL CHECK (total_stars_cents >= 0),
  discount_stars_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_stars_cents >= 0),
  delivery_fee_stars_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_stars_cents >= 0),
  delivery_method TEXT NOT NULL CHECK (delivery_method = 'digital_download'),
  promo_code TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL DEFAULT 'Digital download',
  comment TEXT NOT NULL DEFAULT '',
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  product_code TEXT NOT NULL,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_stars_cents INTEGER NOT NULL CHECK (unit_price_stars_cents >= 0),
  line_total_stars_cents INTEGER NOT NULL CHECK (line_total_stars_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_telegram_user_id BIGINT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'telegram_stars',
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  invoice_payload TEXT,
  invoice_payload_hash TEXT NOT NULL,
  telegram_payment_charge_id TEXT UNIQUE,
  provider_payment_charge_id TEXT,
  status TEXT NOT NULL,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_usage (
  id BIGSERIAL PRIMARY KEY,
  promo_code TEXT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  discount_stars_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_stars_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promo_code, order_id)
);

CREATE TABLE IF NOT EXISTS admin_members (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  added_by_telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  cover JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  content JSONB NOT NULL,
  published_at DATE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  author_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_reactions (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS artist_earnings_ledger (
  id TEXT PRIMARY KEY,
  artist_telegram_user_id BIGINT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('release_sale', 'donation', 'subscription')),
  source_id TEXT NOT NULL,
  order_id TEXT,
  buyer_telegram_user_id BIGINT,
  amount_stars_cents INTEGER NOT NULL CHECK (amount_stars_cents >= 0),
  earned_at TIMESTAMPTZ NOT NULL,
  hold_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artist_payout_requests (
  id TEXT PRIMARY KEY,
  artist_telegram_user_id BIGINT NOT NULL,
  ton_wallet_address TEXT NOT NULL,
  amount_stars_cents INTEGER NOT NULL CHECK (amount_stars_cents >= 0),
  note TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected', 'paid')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_telegram_user_id BIGINT,
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_updated ON orders(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_created ON order_status_history(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order_created ON payments(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(telegram_payment_charge_id);
CREATE INDEX IF NOT EXISTS idx_promo_usage_promo_created ON promo_usage(promo_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON post_comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_type ON post_reactions(post_id, reaction_type);
CREATE INDEX IF NOT EXISTS idx_artist_earnings_artist_earned ON artist_earnings_ledger(artist_telegram_user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_earnings_order_id ON artist_earnings_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_artist_payout_requests_artist_updated ON artist_payout_requests(artist_telegram_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_payout_requests_status_updated ON artist_payout_requests(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION c3k_get_app_state(p_key TEXT)
RETURNS TABLE(payload JSONB, row_version BIGINT, updated_at TIMESTAMPTZ)
LANGUAGE SQL
STABLE
AS $$
  SELECT app_state.payload, app_state.row_version, app_state.updated_at
  FROM app_state
  WHERE app_state.key = p_key;
$$;

CREATE OR REPLACE FUNCTION c3k_put_app_state(
  p_key TEXT,
  p_payload JSONB,
  p_expected_row_version BIGINT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, row_version BIGINT, error TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  next_version BIGINT;
BEGIN
  IF p_expected_row_version IS NULL THEN
    INSERT INTO app_state(key, payload, row_version, updated_at)
    VALUES (p_key, COALESCE(p_payload, '{}'::jsonb), 1, NOW())
    ON CONFLICT (key)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      row_version = app_state.row_version + 1,
      updated_at = NOW()
    RETURNING app_state.row_version INTO next_version;

    RETURN QUERY SELECT TRUE, next_version, NULL::TEXT;
    RETURN;
  END IF;

  IF p_expected_row_version = 0 THEN
    INSERT INTO app_state(key, payload, row_version, updated_at)
    VALUES (p_key, COALESCE(p_payload, '{}'::jsonb), 1, NOW())
    ON CONFLICT DO NOTHING
    RETURNING app_state.row_version INTO next_version;

    IF FOUND THEN
      RETURN QUERY SELECT TRUE, next_version, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  UPDATE app_state
  SET
    payload = COALESCE(p_payload, '{}'::jsonb),
    row_version = app_state.row_version + 1,
    updated_at = NOW()
  WHERE app_state.key = p_key
    AND app_state.row_version = p_expected_row_version
  RETURNING app_state.row_version INTO next_version;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, next_version, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, NULL::BIGINT, 'version_conflict'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION c3k_upsert_order_snapshot(
  p_order JSONB,
  p_expected_row_version BIGINT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, row_version BIGINT, error TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_code TEXT;
  v_user_id BIGINT;
  v_order_id BIGINT;
  v_existing_row_version BIGINT;
  v_next_row_version BIGINT;
  v_status TEXT;
  v_payment_status TEXT;
BEGIN
  v_order_code := UPPER(REGEXP_REPLACE(COALESCE(p_order ->> 'id', ''), '[^A-Z0-9-]', '', 'g'));

  IF v_order_code = '' THEN
    RETURN QUERY SELECT FALSE, NULL::BIGINT, 'invalid_order_code'::TEXT;
    RETURN;
  END IF;

  INSERT INTO users(
    telegram_user_id,
    username,
    first_name,
    last_name,
    phone,
    email,
    updated_at
  )
  VALUES (
    COALESCE((p_order ->> 'telegramUserId')::BIGINT, 0),
    NULLIF(p_order ->> 'telegramUsername', ''),
    NULLIF(p_order ->> 'telegramFirstName', ''),
    NULLIF(p_order ->> 'telegramLastName', ''),
    NULLIF(p_order ->> 'phone', ''),
    NULLIF(p_order ->> 'email', ''),
    NOW()
  )
  ON CONFLICT (telegram_user_id)
  DO UPDATE SET
    username = COALESCE(EXCLUDED.username, users.username),
    first_name = COALESCE(EXCLUDED.first_name, users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, users.last_name),
    phone = COALESCE(EXCLUDED.phone, users.phone),
    email = COALESCE(EXCLUDED.email, users.email),
    updated_at = NOW()
  RETURNING users.id INTO v_user_id;

  SELECT orders.id, orders.row_version
  INTO v_order_id, v_existing_row_version
  FROM orders
  WHERE orders.order_code = v_order_code
  LIMIT 1
  FOR UPDATE;

  IF v_order_id IS NULL THEN
    IF p_expected_row_version IS NOT NULL AND p_expected_row_version <> 0 THEN
      RETURN QUERY SELECT FALSE, NULL::BIGINT, 'version_conflict'::TEXT;
      RETURN;
    END IF;

    INSERT INTO orders(
      order_code,
      user_id,
      status,
      payment_status,
      invoice_stars,
      total_stars_cents,
      discount_stars_cents,
      delivery_fee_stars_cents,
      delivery_method,
      promo_code,
      customer_name,
      phone,
      email,
      address,
      comment,
      row_version,
      created_at,
      updated_at
    )
    VALUES (
      v_order_code,
      v_user_id,
      COALESCE(NULLIF(p_order ->> 'status', ''), 'created'),
      COALESCE(NULLIF((p_order -> 'payment' ->> 'status'), ''), 'created'),
      GREATEST(0, COALESCE((p_order ->> 'invoiceStars')::INTEGER, 0)),
      GREATEST(0, COALESCE((p_order ->> 'totalStarsCents')::INTEGER, 0)),
      GREATEST(0, COALESCE((p_order ->> 'discountStarsCents')::INTEGER, 0)),
      GREATEST(0, COALESCE((p_order ->> 'deliveryFeeStarsCents')::INTEGER, 0)),
      'digital_download',
      NULLIF(p_order ->> 'promoCode', ''),
      COALESCE(NULLIF(p_order ->> 'customerName', ''), ''),
      COALESCE(NULLIF(p_order ->> 'phone', ''), ''),
      NULLIF(p_order ->> 'email', ''),
      COALESCE(NULLIF(p_order ->> 'address', ''), 'Digital download'),
      COALESCE(p_order ->> 'comment', ''),
      1,
      COALESCE((p_order ->> 'createdAt')::TIMESTAMPTZ, NOW()),
      COALESCE((p_order ->> 'updatedAt')::TIMESTAMPTZ, NOW())
    )
    RETURNING orders.id, orders.row_version, orders.status, orders.payment_status
    INTO v_order_id, v_next_row_version, v_status, v_payment_status;
  ELSE
    IF p_expected_row_version IS NOT NULL AND p_expected_row_version <> v_existing_row_version THEN
      RETURN QUERY SELECT FALSE, NULL::BIGINT, 'version_conflict'::TEXT;
      RETURN;
    END IF;

    UPDATE orders
    SET
      user_id = v_user_id,
      status = COALESCE(NULLIF(p_order ->> 'status', ''), orders.status),
      payment_status = COALESCE(NULLIF((p_order -> 'payment' ->> 'status'), ''), orders.payment_status),
      invoice_stars = GREATEST(0, COALESCE((p_order ->> 'invoiceStars')::INTEGER, orders.invoice_stars)),
      total_stars_cents = GREATEST(0, COALESCE((p_order ->> 'totalStarsCents')::INTEGER, orders.total_stars_cents)),
      discount_stars_cents = GREATEST(0, COALESCE((p_order ->> 'discountStarsCents')::INTEGER, orders.discount_stars_cents)),
      delivery_fee_stars_cents = GREATEST(0, COALESCE((p_order ->> 'deliveryFeeStarsCents')::INTEGER, orders.delivery_fee_stars_cents)),
      delivery_method = 'digital_download',
      promo_code = COALESCE(NULLIF(p_order ->> 'promoCode', ''), orders.promo_code),
      customer_name = COALESCE(NULLIF(p_order ->> 'customerName', ''), orders.customer_name),
      phone = COALESCE(NULLIF(p_order ->> 'phone', ''), orders.phone),
      email = COALESCE(NULLIF(p_order ->> 'email', ''), orders.email),
      address = COALESCE(NULLIF(p_order ->> 'address', ''), 'Digital download'),
      comment = COALESCE(p_order ->> 'comment', orders.comment),
      row_version = orders.row_version + 1,
      updated_at = COALESCE((p_order ->> 'updatedAt')::TIMESTAMPTZ, NOW())
    WHERE orders.id = v_order_id
    RETURNING orders.row_version, orders.status, orders.payment_status
    INTO v_next_row_version, v_status, v_payment_status;
  END IF;

  DELETE FROM order_items WHERE order_items.order_id = v_order_id;
  INSERT INTO order_items(
    order_id,
    product_code,
    title,
    quantity,
    unit_price_stars_cents,
    line_total_stars_cents,
    created_at,
    updated_at
  )
  SELECT
    v_order_id,
    COALESCE(NULLIF(item ->> 'productId', ''), ''),
    COALESCE(NULLIF(item ->> 'title', ''), ''),
    GREATEST(1, COALESCE((item ->> 'quantity')::INTEGER, 1)),
    GREATEST(0, COALESCE((item ->> 'priceStarsCents')::INTEGER, 0)),
    GREATEST(0, COALESCE((item ->> 'quantity')::INTEGER, 1) * GREATEST(0, COALESCE((item ->> 'priceStarsCents')::INTEGER, 0))),
    NOW(),
    NOW()
  FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_order -> 'items', '[]'::JSONB)) item;

  DELETE FROM order_status_history WHERE order_status_history.order_id = v_order_id;
  INSERT INTO order_status_history(
    order_id,
    from_status,
    to_status,
    actor_type,
    actor_telegram_user_id,
    note,
    created_at
  )
  SELECT
    v_order_id,
    NULLIF(item ->> 'fromStatus', ''),
    COALESCE(NULLIF(item ->> 'toStatus', ''), v_status),
    COALESCE(NULLIF(item ->> 'actor', ''), 'system'),
    NULLIF(item ->> 'actorTelegramId', '')::BIGINT,
    NULLIF(item ->> 'note', ''),
    COALESCE((item ->> 'at')::TIMESTAMPTZ, NOW())
  FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_order -> 'history', '[]'::JSONB)) item;

  IF p_order ? 'payment' THEN
    DELETE FROM payments WHERE payments.order_id = v_order_id;

    INSERT INTO payments(
      order_id,
      provider,
      currency,
      amount,
      invoice_payload,
      invoice_payload_hash,
      telegram_payment_charge_id,
      provider_payment_charge_id,
      status,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      v_order_id,
      'telegram_stars',
      COALESCE(NULLIF(p_order -> 'payment' ->> 'currency', ''), 'XTR'),
      GREATEST(0, COALESCE((p_order -> 'payment' ->> 'amount')::INTEGER, 0)),
      NULLIF(p_order -> 'payment' ->> 'invoicePayload', ''),
      COALESCE(NULLIF(p_order -> 'payment' ->> 'invoicePayloadHash', ''), ''),
      NULLIF(p_order -> 'payment' ->> 'telegramPaymentChargeId', ''),
      NULLIF(p_order -> 'payment' ->> 'providerPaymentChargeId', ''),
      COALESCE(NULLIF(p_order -> 'payment' ->> 'status', ''), v_payment_status),
      COALESCE(p_order -> 'payment', '{}'::JSONB),
      NOW(),
      NOW()
    )
    ON CONFLICT (telegram_payment_charge_id)
    DO UPDATE SET
      provider_payment_charge_id = COALESCE(EXCLUDED.provider_payment_charge_id, payments.provider_payment_charge_id),
      status = EXCLUDED.status,
      amount = EXCLUDED.amount,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();
  END IF;

  IF COALESCE(NULLIF(p_order ->> 'promoCode', ''), '') <> '' AND v_status = 'paid' THEN
    INSERT INTO promo_usage(
      promo_code,
      order_id,
      user_id,
      discount_stars_cents,
      created_at
    )
    VALUES (
      COALESCE(NULLIF(p_order ->> 'promoCode', ''), ''),
      v_order_id,
      v_user_id,
      GREATEST(0, COALESCE((p_order ->> 'discountStarsCents')::INTEGER, 0)),
      NOW()
    )
    ON CONFLICT (promo_code, order_id)
    DO UPDATE SET
      discount_stars_cents = EXCLUDED.discount_stars_cents;
  END IF;

  RETURN QUERY SELECT TRUE, v_next_row_version, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION c3k_get_order_snapshot(p_order_code TEXT)
RETURNS TABLE(order_snapshot JSONB, row_version BIGINT)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    JSONB_BUILD_OBJECT(
      'id', o.order_code,
      'createdAt', o.created_at,
      'updatedAt', o.updated_at,
      'status', o.status,
      'invoiceStars', o.invoice_stars,
      'totalStarsCents', o.total_stars_cents,
      'deliveryFeeStarsCents', o.delivery_fee_stars_cents,
      'discountStarsCents', o.discount_stars_cents,
      'delivery', o.delivery_method,
      'promoCode', o.promo_code,
      'address', o.address,
      'customerName', o.customer_name,
      'phone', o.phone,
      'email', o.email,
      'comment', o.comment,
      'telegramUserId', u.telegram_user_id,
      'telegramUsername', u.username,
      'telegramFirstName', u.first_name,
      'telegramLastName', u.last_name,
      'payment', (
        SELECT TO_JSONB(pay) - 'id' - 'order_id' - 'provider' - 'failure_reason' - 'metadata' - 'created_at'
        FROM (
          SELECT
            p.currency,
            p.amount,
            p.invoice_payload_hash AS "invoicePayloadHash",
            p.invoice_payload AS "invoicePayload",
            p.telegram_payment_charge_id AS "telegramPaymentChargeId",
            p.provider_payment_charge_id AS "providerPaymentChargeId",
            p.status,
            p.updated_at AS "updatedAt"
          FROM payments p
          WHERE p.order_id = o.id
          ORDER BY p.updated_at DESC
          LIMIT 1
        ) pay
      ),
      'items', COALESCE((
        SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
          'productId', oi.product_code,
          'title', oi.title,
          'quantity', oi.quantity,
          'priceStarsCents', oi.unit_price_stars_cents
        ) ORDER BY oi.id ASC)
        FROM order_items oi
        WHERE oi.order_id = o.id
      ), '[]'::JSONB),
      'history', COALESCE((
        SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
          'id', CONCAT(h.id::TEXT, '-', EXTRACT(EPOCH FROM h.created_at)::BIGINT::TEXT),
          'at', h.created_at,
          'fromStatus', h.from_status,
          'toStatus', h.to_status,
          'actor', h.actor_type,
          'actorTelegramId', h.actor_telegram_user_id,
          'note', h.note
        ) ORDER BY h.created_at DESC, h.id DESC)
        FROM order_status_history h
        WHERE h.order_id = o.id
      ), '[]'::JSONB)
    ) AS order_snapshot,
    o.row_version
  FROM orders o
  JOIN users u ON u.id = o.user_id
  WHERE o.order_code = p_order_code
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION c3k_list_order_snapshots(p_telegram_user_id BIGINT DEFAULT NULL)
RETURNS TABLE(order_snapshot JSONB, row_version BIGINT, updated_at TIMESTAMPTZ)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    snapshot.order_snapshot,
    snapshot.row_version,
    o.updated_at
  FROM orders o
  JOIN users u ON u.id = o.user_id
  CROSS JOIN LATERAL c3k_get_order_snapshot(o.order_code) snapshot
  WHERE p_telegram_user_id IS NULL OR u.telegram_user_id = p_telegram_user_id
  ORDER BY o.updated_at DESC, o.id DESC;
$$;

COMMIT;
