import { Pool } from "pg";

async function seed(): Promise<void> {
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://resort:resort@localhost:5432/resort" });
const plans = [
  ["FREE", "Free", 10, 0, "Target AI accuracy ~80%", true, ["Personal dashboard"]],
  ["PLUS", "Plus", 100, 999, "Target AI accuracy ~90%", true, ["Enhanced verification", "Dashboard and history"]],
  ["HOUSEHOLD", "Household", 250, 1799, "Target AI accuracy >90%", false, ["Up to 4 accounts", "Optional child accounts"]],
] as const;
for (const [code, name, limit, price, accuracy, checkout, features] of plans) {
  await pool.query(`INSERT INTO subscription_plans(code,name,weekly_image_limit,price_cents,accuracy_label,checkout_enabled,features_json)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,weekly_image_limit=EXCLUDED.weekly_image_limit,price_cents=EXCLUDED.price_cents,accuracy_label=EXCLUDED.accuracy_label,checkout_enabled=EXCLUDED.checkout_enabled,features_json=EXCLUDED.features_json`,
  [code, name, limit, price, accuracy, checkout, JSON.stringify(features)]);
}
await pool.end();
process.stdout.write("Subscription plans seeded. Demo user remains available in DATA_MODE=memory.\n");
}

void seed();
