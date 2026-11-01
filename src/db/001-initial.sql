CREATE TABLE IF NOT EXISTS reservations (
 refund_key text PRIMARY KEY, capture_id text NOT NULL, return_id text NOT NULL,
 input_hash text NOT NULL, currency text NOT NULL CHECK(currency='AUD'),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 state text NOT NULL CHECK(state IN ('open','held','released','consumed')),
 receipt_id text, UNIQUE(capture_id,return_id)
);
CREATE TABLE IF NOT EXISTS receiver_outcomes (
 refund_key text PRIMARY KEY, input_hash text NOT NULL, capture_id text NOT NULL,
 return_id text NOT NULL, amount_cents bigint NOT NULL, currency text NOT NULL,
 status text NOT NULL CHECK(status IN ('committed','rejected')), receipt_id text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS receiver_effects (
 refund_key text PRIMARY KEY REFERENCES receiver_outcomes(refund_key),
 amount_cents bigint NOT NULL, currency text NOT NULL, capture_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS fixture_control (
 refund_key text PRIMARY KEY, reserve_failures int NOT NULL DEFAULT 0,
 reserve_attempts int NOT NULL DEFAULT 0, hold_reservation boolean NOT NULL DEFAULT false,
 reservation_reached boolean NOT NULL DEFAULT false, reject_payment boolean NOT NULL DEFAULT false,
 drop_response boolean NOT NULL DEFAULT false, deny_lookup boolean NOT NULL DEFAULT false,
 hold_payment boolean NOT NULL DEFAULT false, payment_reached boolean NOT NULL DEFAULT false,
 release_payment boolean NOT NULL DEFAULT false, reached_at timestamptz
);
CREATE TABLE IF NOT EXISTS activity_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_key text NOT NULL, activity text NOT NULL,
 attempt int NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS wire_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_key text NOT NULL, method text NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
