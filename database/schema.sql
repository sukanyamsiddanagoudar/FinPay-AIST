-- FinPay database (3NF) - based on the Lab 4 Detailed Design Record.
-- Requires MySQL 8.0.16 or newer (older versions silently ignore CHECK constraints).
-- To use a different database name, change BOTH lines below and DB_NAME in .env.
CREATE DATABASE IF NOT EXISTS finpay_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finpay_db;

-- STUDENT: only the student identity (design assumption AS1).
CREATE TABLE IF NOT EXISTS student (
  student_id   INT AUTO_INCREMENT PRIMARY KEY,
  student_name VARCHAR(100) NOT NULL
);

-- Stand-in for the "existing JWT authentication" the design reuses.
-- Not part of the FinPay 3NF model; it only stores login credentials so this app can run on its own.
CREATE TABLE IF NOT EXISTS student_login (
  student_id    INT PRIMARY KEY,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  FOREIGN KEY (student_id) REFERENCES student(student_id) ON DELETE CASCADE
);

-- WALLET_TIER: multipliers depend on Tier only (x10: 1.5x = 15).
CREATE TABLE IF NOT EXISTS wallet_tier (
  tier           VARCHAR(10) PRIMARY KEY,
  rate_mult_x10  INT NOT NULL,
  cap_mult_x10   INT NOT NULL,
  CONSTRAINT chk_tier_rate CHECK (rate_mult_x10 > 0),
  CONSTRAINT chk_tier_cap  CHECK (cap_mult_x10 > 0)
);

-- CASHBACK_RULE: rate (basis points, 200 = 2.0%) and base monthly cap (paise) depend on Category only.
CREATE TABLE IF NOT EXISTS cashback_rule (
  category               VARCHAR(20) PRIMARY KEY,
  base_rate_bps          INT NOT NULL,
  base_monthly_cap_paise BIGINT NOT NULL,
  CONSTRAINT chk_rule_rate CHECK (base_rate_bps >= 0),
  CONSTRAINT chk_rule_cap  CHECK (base_monthly_cap_paise >= 0)
);

CREATE TABLE IF NOT EXISTS merchant (
  merchant_id   INT AUTO_INCREMENT PRIMARY KEY,
  merchant_name VARCHAR(120) NOT NULL,
  category      VARCHAR(20) NOT NULL,
  FOREIGN KEY (category) REFERENCES cashback_rule(category)
);

-- WALLET: one wallet per student (UNIQUE student_id). Balance in integer paise, never negative.
CREATE TABLE IF NOT EXISTS wallet (
  wallet_id      INT AUTO_INCREMENT PRIMARY KEY,
  student_id     INT NOT NULL UNIQUE,
  tier           VARCHAR(10) NOT NULL DEFAULT 'BASIC',
  balance_paise  BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES student(student_id),
  FOREIGN KEY (tier) REFERENCES wallet_tier(tier),
  CONSTRAINT chk_wallet_balance CHECK (balance_paise >= 0)
);

-- TRANSACTION (physical name payment_transaction, AS6). Insert-only history.
-- UNIQUE(wallet_id, idempotency_key) = duplicate-payment protection inside the database.
-- Monthly cashback used is DERIVED: SUM(cashback_paise) for wallet + category + month (never stored).
CREATE TABLE IF NOT EXISTS payment_transaction (
  transaction_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
  wallet_id       INT NOT NULL,
  merchant_id     INT NOT NULL,
  idempotency_key VARCHAR(64) NOT NULL,
  amount_paise    BIGINT NOT NULL,
  cashback_paise  BIGINT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL,
  FOREIGN KEY (wallet_id)   REFERENCES wallet(wallet_id),
  FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id),
  CONSTRAINT uq_wallet_idempotency UNIQUE (wallet_id, idempotency_key),
  CONSTRAINT chk_tx_amount   CHECK (amount_paise > 0),
  CONSTRAINT chk_tx_cashback CHECK (cashback_paise >= 0),
  INDEX idx_wallet_created (wallet_id, created_at)
);

-- ---------- Seed data (safe to re-run) ----------
INSERT IGNORE INTO wallet_tier (tier, rate_mult_x10, cap_mult_x10) VALUES
  ('BASIC', 10, 10), ('PRIME', 15, 15), ('PREMIUM', 20, 20);

INSERT IGNORE INTO cashback_rule (category, base_rate_bps, base_monthly_cap_paise) VALUES
  ('CANTEEN', 200, 5000), ('STATIONERY', 100, 2000), ('TRANSPORT', 300, 10000),
  ('HOSTEL', 50, 20000), ('ONLINE', 100, 3000), ('TOPUP', 0, 0);

INSERT IGNORE INTO merchant (merchant_id, merchant_name, category) VALUES
  (1, 'Campus Canteen',       'CANTEEN'),
  (2, 'Juice Corner',         'CANTEEN'),
  (3, 'Campus Stationery',    'STATIONERY'),
  (4, 'Metro Shuttle',        'TRANSPORT'),
  (5, 'Hostel Mess Office',   'HOSTEL'),
  (6, 'Online Bookstore',     'ONLINE'),
  (7, 'FinPay Wallet Top-up', 'TOPUP');
