import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://resort:resort@localhost:5432/resort";
if (process.env.NODE_ENV === "production" && databaseUrl.includes("resort:resort")) throw new Error("Refusing default database credentials in production");

async function migrate(): Promise<void> {
const pool = new Pool({ connectionString: databaseUrl });
await pool.query(`
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username varchar(50) UNIQUE NOT NULL,
    password_hash text NOT NULL,
    display_name varchar(80),
    country_code char(2) NOT NULL DEFAULT 'DE',
    timezone varchar(64) NOT NULL DEFAULT 'Europe/Berlin',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS subscription_plans (
    code varchar(20) PRIMARY KEY,
    name varchar(50) NOT NULL,
    weekly_image_limit integer NOT NULL,
    price_cents integer NOT NULL,
    accuracy_label varchar(100) NOT NULL,
    checkout_enabled boolean NOT NULL DEFAULT false,
    features_json jsonb NOT NULL DEFAULT '[]'::jsonb
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_code varchar(20) NOT NULL REFERENCES subscription_plans(code),
    status varchar(20) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS weekly_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, week_start)
  );
  CREATE TABLE IF NOT EXISTS scan_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key uuid NOT NULL,
    status varchar(20) NOT NULL,
    country_code char(2) NOT NULL DEFAULT 'DE',
    identification_json jsonb,
    ai_provider varchar(20) NOT NULL DEFAULT 'MOCK',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, idempotency_key)
  );
  CREATE TABLE IF NOT EXISTS waste_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id uuid UNIQUE NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    identified_name varchar(120) NOT NULL,
    waste_category varchar(40) NOT NULL,
    disposal_route varchar(60) NOT NULL,
    bin_label varchar(120) NOT NULL,
    rule_set_version varchar(80) NOT NULL,
    record_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS scan_jobs_user_created_idx ON scan_jobs(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS waste_records_user_created_idx ON waste_records(user_id, created_at DESC);
`);
await pool.end();
process.stdout.write("PostgreSQL schema is ready.\n");
}

void migrate();
