import type { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1723680000000 implements MigrationInterface {
  name = "Initial1723680000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(30) UNIQUE NOT NULL,
        password_hash text NOT NULL,
        display_name varchar(80) NOT NULL,
        country_code char(2) NOT NULL DEFAULT 'DE',
        timezone varchar(64) NOT NULL DEFAULT 'Europe/Berlin',
        role varchar(20) NOT NULL DEFAULT 'USER',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text UNIQUE NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        rotated_to_session_id uuid REFERENCES refresh_sessions(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS countries (
        code char(2) PRIMARY KEY,
        name varchar(80) NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        coming_soon boolean NOT NULL DEFAULT false,
        default_timezone varchar(64) NOT NULL,
        active_rule_set_id uuid
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rule_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code char(2) NOT NULL REFERENCES countries(code),
        title text NOT NULL,
        authority text NOT NULL,
        source_url text UNIQUE NOT NULL,
        source_type varchar(40) NOT NULL,
        published_at date,
        effective_from date NOT NULL,
        effective_to date,
        last_verified_at timestamptz NOT NULL,
        content_hash text,
        notes text
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rule_sets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code char(2) NOT NULL REFERENCES countries(code),
        version varchar(100) UNIQUE NOT NULL,
        effective_from date NOT NULL,
        effective_to date,
        status varchar(20) NOT NULL,
        source_snapshot_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sorting_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_set_id uuid NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
        code varchar(80) NOT NULL,
        priority integer NOT NULL,
        conditions_json jsonb NOT NULL,
        waste_category varchar(50) NOT NULL,
        disposal_route varchar(80) NOT NULL,
        bin_label varchar(160) NOT NULL,
        preparation_steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        reuse_recycle_tips_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        requires_local_guidance boolean NOT NULL DEFAULT false,
        source_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        UNIQUE(rule_set_id, code)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        code varchar(20) PRIMARY KEY,
        name varchar(50) NOT NULL,
        weekly_image_limit integer NOT NULL,
        price_cents integer NOT NULL,
        accuracy_label varchar(100) NOT NULL,
        quality_tier varchar(40) NOT NULL,
        features_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        checkout_enabled boolean NOT NULL DEFAULT false,
        coming_soon boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_code varchar(20) NOT NULL REFERENCES subscription_plans(code),
        status varchar(20) NOT NULL DEFAULT 'ACTIVE',
        started_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS weekly_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start date NOT NULL,
        used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, week_start)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scan_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key uuid NOT NULL,
        status varchar(20) NOT NULL,
        country_code char(2) NOT NULL REFERENCES countries(code),
        rule_set_version_snapshot varchar(100),
        subscription_plan_snapshot varchar(20) NOT NULL,
        quality_tier_snapshot varchar(40) NOT NULL,
        identification_json jsonb,
        ai_provider varchar(20) NOT NULL,
        ai_model varchar(120),
        prompt_version varchar(80) NOT NULL,
        ai_latency_ms integer,
        ai_request_id text,
        quota_reserved boolean NOT NULL DEFAULT false,
        quota_released_at timestamptz,
        error_code varchar(80),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz,
        UNIQUE(user_id, idempotency_key)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scan_media (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scan_id uuid UNIQUE NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        storage_key text UNIQUE NOT NULL,
        mime_type varchar(40) NOT NULL,
        byte_size integer NOT NULL,
        width integer NOT NULL,
        height integer NOT NULL,
        sha256 char(64) NOT NULL,
        metadata_stripped boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        delete_after timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scan_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scan_id uuid UNIQUE NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason_code varchar(80),
        comment varchar(500),
        identification_snapshot_json jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS carbon_factor_sets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version varchar(100) UNIQUE NOT NULL,
        source_name text NOT NULL,
        source_url text NOT NULL,
        source_country char(2) NOT NULL,
        applicable_country char(2) NOT NULL,
        is_proxy boolean NOT NULL,
        boundary text NOT NULL,
        published_at date
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS carbon_factors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        factor_set_id uuid NOT NULL REFERENCES carbon_factor_sets(id) ON DELETE CASCADE,
        waste_category varchar(50),
        material varchar(80),
        treatment_route varchar(80) NOT NULL,
        kg_co2e_per_tonne numeric(18,8) NOT NULL,
        UNIQUE(factor_set_id, waste_category, treatment_route)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS waste_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scan_id uuid UNIQUE NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        identified_name varchar(120) NOT NULL,
        waste_type_label varchar(160) NOT NULL,
        waste_category varchar(50) NOT NULL,
        primary_material varchar(80) NOT NULL,
        material_label varchar(160) NOT NULL,
        disposal_route varchar(80) NOT NULL,
        bin_label varchar(160) NOT NULL,
        preparation_steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        reuse_suggestions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        environmental_impact_summary text NOT NULL,
        classification_confidence numeric(5,4) NOT NULL,
        estimated_weight_grams integer NOT NULL,
        weight_source varchar(40) NOT NULL,
        weight_confidence numeric(5,4),
        estimated_disposal_co2e_kg numeric(18,9),
        carbon_factor_id uuid REFERENCES carbon_factors(id),
        carbon_methodology_version varchar(100),
        carbon_boundary text,
        requires_local_guidance boolean NOT NULL DEFAULT false,
        local_warning text,
        rule_set_version varchar(100) NOT NULL,
        rule_set_effective_from date NOT NULL,
        source_snapshot_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        seeded boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_code varchar(20) NOT NULL REFERENCES subscription_plans(code),
        amount_cents integer NOT NULL,
        currency char(3) NOT NULL DEFAULT 'EUR',
        status varchar(20) NOT NULL,
        provider varchar(20) NOT NULL DEFAULT 'FAKE',
        provider_reference text UNIQUE NOT NULL,
        failure_code varchar(80),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS refresh_sessions_user_expires_idx ON refresh_sessions(user_id, expires_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS scan_jobs_user_created_idx ON scan_jobs(user_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS scan_jobs_status_created_idx ON scan_jobs(status, created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS waste_records_user_created_idx ON waste_records(user_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS waste_records_user_category_created_idx ON waste_records(user_id, waste_category, created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS scan_feedback_user_created_idx ON scan_feedback(user_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS payment_transactions_user_created_idx ON payment_transactions(user_id, created_at DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payment_transactions, waste_records, carbon_factors, carbon_factor_sets, scan_feedback, scan_media, scan_jobs, weekly_usage, subscriptions, subscription_plans, sorting_rules, rule_sets, rule_sources, countries, refresh_sessions, users CASCADE`);
  }
}
