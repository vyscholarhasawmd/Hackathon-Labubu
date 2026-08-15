import * as argon2 from "argon2";
import type { QueryRunner } from "typeorm";
import { appConfig } from "../config";
import { createDataSource } from "./data-source";

const RULE_VERSION = "DE-FEDERAL-2026.08.12-v2";
const RULE_EFFECTIVE_FROM = "2026-08-12";

const sources = [
  ["German packaging framework effective-date summary", "German Federal Government", "https://www.bundesregierung.de/breg-de/aktuelles/verpackungsrecht-gesetz-2406776", "GOVERNMENT_GUIDANCE", "2026-08-12", "Confirms the framework effective date and replacement of the previous Packaging Act."],
  ["VerpackDG official publication", "Bundesgesetzblatt", "https://www.recht.bund.de/bgbl/1/2026/207/VO.html", "LAW", "2026-08-12", "Official publication; availability should be rechecked during each legal-source audit."],
  ["Regulation (EU) 2025/40", "European Union", "https://eur-lex.europa.eu/eli/reg/2025/40/oj", "REGULATION", "2025-02-11", "EU Packaging and Packaging Waste Regulation."],
  ["KrWG §20 separate collection", "Federal Ministry of Justice", "https://www.gesetze-im-internet.de/krwg/__20.html", "LAW", "2025-01-01", "Separate collection categories including bio, plastic, metal, paper, glass, textiles, bulky and hazardous waste."],
  ["ElektroG §10 separate collection", "Federal Ministry of Justice", "https://www.gesetze-im-internet.de/elektrog_2015/__10.html", "LAW", "2015-10-24", "E-waste must be collected separately; removable batteries should be separated safely."],
  ["BattDG", "Federal Ministry of Justice", "https://www.gesetze-im-internet.de/battdg/", "LAW", "2025-01-01", "Battery take-back and separate collection baseline."],
  ["UBA household sorting guidance", "German Environment Agency", "https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt", "GOVERNMENT_GUIDANCE", "2026-02-02", "Practical five-stream guidance and municipality caveat; not the sole active legal authority."],
] as const;

const rules = [
  ["DE_SHARPS", 10, { hazard: ["SHARP"] }, "MEDICAL_SHARPS", "SHARPS_CONTAINER_OR_MEDICAL_COLLECTION", "Sharps container and local medical collection", ["Place it in a puncture-resistant container", "Check a pharmacy, medical facility or municipal route"], ["Never place loose sharps in an ordinary household bin"], true],
  ["DE_HAZARDOUS", 20, { hazard: ["PRESSURIZED", "FLAMMABLE", "CORROSIVE", "TOXIC"] }, "HAZARDOUS_WASTE", "HAZARDOUS_WASTE_COLLECTION_POINT", "Hazardous waste collection point", ["Keep the original container and label intact", "Do not mix or pour away", "Use the local Schadstoffmobil or Wertstoffhof"], ["Offer usable material for safe reuse only when appropriate"], true],
  ["DE_BATTERY", 30, { hazard: ["BATTERY"], material: ["BATTERY"] }, "BATTERY", "BATTERY_COLLECTION_POINT", "Battery collection point", ["Keep the battery dry", "Tape exposed lithium terminals where appropriate", "Return it to a retailer or municipal collection point"], ["Consider rechargeable batteries where suitable"], false],
  ["DE_E_WASTE", 40, { hazard: ["ELECTRONIC"], material: ["ELECTRONIC"] }, "E_WASTE", "E_WASTE_COLLECTION_POINT", "E-waste collection point", ["Remove batteries if safely removable", "Take it to a retailer or municipal recycling centre"], ["Repair or extend device life before disposal where practical"], false],
  ["DE_MEDICINE", 50, { hazard: ["MEDICINE"] }, "MEDICINE", "MEDICINE_TAKE_BACK_OR_LOCAL_ROUTE", "Local medicine disposal route", ["Never flush or pour medicine into a sink", "Check the municipality or pharmacy guidance"], ["Buy only the quantity you expect to use"], true],
  ["DE_DEPOSIT", 60, { symbol: ["DPG_DEPOSIT"] }, "DEPOSIT_RETURN", "DEPOSIT_RETURN_POINT", "Deposit return point", ["Empty the container", "Keep the barcode and shape readable", "Return it to a participating retailer"], ["Choose reusable deposit containers where practical"], false],
  ["DE_GLASS_PACKAGING", 80, { packaging: true, material: ["GLASS"] }, "GLASS_PACKAGING", "GLASS_COLLECTION_CONTAINER", "Glass collection container", ["Empty the container", "Sort by glass colour", "Put caps in the yellow bin where applicable"], ["Reuse suitable jars before recycling"], false],
  ["DE_LIGHT_PACKAGING", 90, { packaging: true, material: ["PET", "HDPE", "LDPE", "PP", "PS", "PVC", "PLASTIC", "ALUMINIUM", "STEEL", "METAL", "COMPOSITE"] }, "LIGHTWEIGHT_PACKAGING", "YELLOW_BIN_OR_SACK", "Yellow bin or sack", ["Empty the packaging", "No need to rinse", "Separate easily removable components", "Do not nest different packages"], ["Choose refill or reusable packaging where practical"], false],
  ["DE_PAPER", 100, { material: ["PAPER", "CARDBOARD"] }, "PAPER_CARDBOARD", "PAPER_BIN", "Blue paper bin", ["Keep it clean and dry", "Flatten boxes", "Remove large non-paper components"], ["Reuse paper or boxes before recycling"], false],
  ["DE_ORGANIC", 110, { material: ["ORGANIC"] }, "ORGANIC", "BIO_BIN_OR_COMPOST", "Bio bin", ["Remove stickers and conventional plastic", "Place loose or use a locally approved liner", "Check local accepted bio-waste"], ["Prevent food waste and compost where accepted"], true],
  ["DE_TEXTILE", 120, { material: ["TEXTILE"] }, "TEXTILE", "TEXTILE_COLLECTION_OR_DONATION", "Textile collection or donation", ["Keep reusable textiles clean and dry", "Check local handling for damaged textiles"], ["Repair, donate or reuse wearable items"], true],
  ["DE_RESIDUAL", 200, { material: ["CERAMIC", "RESIDUAL"] }, "RESIDUAL", "RESIDUAL_WASTE_BIN", "Residual waste bin", ["Remove batteries, electronics and hazardous parts first", "Place only the non-recoverable remainder in residual waste"], ["Choose durable and repairable alternatives"], false],
  ["DE_UNKNOWN", 999, {}, "LOCAL_GUIDANCE_REQUIRED", "CHECK_LOCAL_GUIDANCE", "Municipal waste guide or recycling centre", ["Keep the item aside until its route is confirmed", "Retake a clearer photo showing the whole item and labels", "Check the local Abfall-ABC"], ["Reuse the item safely until disposal is confirmed"], true],
] as const;

async function seedPlans(runner: QueryRunner): Promise<void> {
  const plans = [
    ["FREE", "Free", 10, 0, "Target AI accuracy ~80%", "BASIC", ["Basic sorting guidance", "Recent scan history"], true, false],
    ["PLUS", "Plus", 100, 999, "Target AI accuracy ~90%", "ENHANCED", ["Enhanced image detail and verification", "Full history and impact insights"], true, false],
    ["HOUSEHOLD", "Household", 250, 1799, "Target AI accuracy >90%", "HOUSEHOLD_PREVIEW", ["Up to 4 accounts", "Optional child accounts"], false, true],
  ];
  for (const plan of plans) {
    await runner.query(`INSERT INTO subscription_plans(code,name,weekly_image_limit,price_cents,accuracy_label,quality_tier,features_json,checkout_enabled,coming_soon)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,weekly_image_limit=EXCLUDED.weekly_image_limit,price_cents=EXCLUDED.price_cents,accuracy_label=EXCLUDED.accuracy_label,quality_tier=EXCLUDED.quality_tier,features_json=EXCLUDED.features_json,checkout_enabled=EXCLUDED.checkout_enabled,coming_soon=EXCLUDED.coming_soon`,
    [plan[0], plan[1], plan[2], plan[3], plan[4], plan[5], JSON.stringify(plan[6]), plan[7], plan[8]]);
  }
}

async function seedRules(runner: QueryRunner): Promise<void> {
  for (const country of [["DE", "Germany", true, false, "Europe/Berlin"], ["AT", "Austria", false, true, "Europe/Vienna"], ["FR", "France", false, true, "Europe/Paris"], ["NL", "Netherlands", false, true, "Europe/Amsterdam"]]) {
    await runner.query(`INSERT INTO countries(code,name,enabled,coming_soon,default_timezone) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,coming_soon=EXCLUDED.coming_soon,default_timezone=EXCLUDED.default_timezone`, country);
  }
  for (const source of sources) {
    await runner.query(`INSERT INTO rule_sources(country_code,title,authority,source_url,source_type,effective_from,last_verified_at,notes)
      VALUES('DE',$1,$2,$3,$4,$5,now(),$6)
      ON CONFLICT(source_url) DO UPDATE SET title=EXCLUDED.title,authority=EXCLUDED.authority,source_type=EXCLUDED.source_type,effective_from=EXCLUDED.effective_from,last_verified_at=now(),notes=EXCLUDED.notes`, [...source]);
  }
  const sourceRows = await runner.query(`SELECT id, source_url FROM rule_sources WHERE country_code='DE'`) as Array<{ id: string; source_url: string }>;
  const sourceIds = sourceRows.map((row) => row.id);
  await runner.query(`UPDATE rule_sets SET status='RETIRED', effective_to=$1 WHERE country_code='DE' AND version<>$2 AND status='ACTIVE'`, [RULE_EFFECTIVE_FROM, RULE_VERSION]);
  const setRows = await runner.query(`INSERT INTO rule_sets(country_code,version,effective_from,status,source_snapshot_json)
    VALUES('DE',$1,$2,'ACTIVE',$3::jsonb)
    ON CONFLICT(version) DO UPDATE SET status='ACTIVE',source_snapshot_json=EXCLUDED.source_snapshot_json
    RETURNING id`, [RULE_VERSION, RULE_EFFECTIVE_FROM, JSON.stringify(sourceRows)]) as Array<{ id: string }>;
  const ruleSetId = setRows[0]!.id;
  await runner.query(`UPDATE countries SET active_rule_set_id=$1 WHERE code='DE'`, [ruleSetId]);
  for (const rule of rules) {
    await runner.query(`INSERT INTO sorting_rules(rule_set_id,code,priority,conditions_json,waste_category,disposal_route,bin_label,preparation_steps_json,reuse_recycle_tips_json,requires_local_guidance,source_ids_json)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb)
      ON CONFLICT(rule_set_id,code) DO UPDATE SET priority=EXCLUDED.priority,conditions_json=EXCLUDED.conditions_json,waste_category=EXCLUDED.waste_category,disposal_route=EXCLUDED.disposal_route,bin_label=EXCLUDED.bin_label,preparation_steps_json=EXCLUDED.preparation_steps_json,reuse_recycle_tips_json=EXCLUDED.reuse_recycle_tips_json,requires_local_guidance=EXCLUDED.requires_local_guidance,source_ids_json=EXCLUDED.source_ids_json`,
    [ruleSetId, rule[0], rule[1], JSON.stringify(rule[2]), rule[3], rule[4], rule[5], JSON.stringify(rule[6]), JSON.stringify(rule[7]), rule[8], JSON.stringify(sourceIds)]);
  }
}

async function seedCarbon(runner: QueryRunner): Promise<void> {
  const rows = await runner.query(`INSERT INTO carbon_factor_sets(version,source_name,source_url,source_country,applicable_country,is_proxy,boundary,published_at)
    VALUES('DESNZ-2026-WASTE-PROXY-v1','UK Government GHG Conversion Factors 2026','https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026','GB','DE',true,'Collection/delivery or treatment proxy; not a full product life-cycle assessment','2026-01-01')
    ON CONFLICT(version) DO UPDATE SET boundary=EXCLUDED.boundary RETURNING id`) as Array<{ id: string }>;
  const setId = rows[0]!.id;
  const factors = [
    ["LIGHTWEIGHT_PACKAGING", "YELLOW_BIN_OR_SACK", 4.65358], ["PAPER_CARDBOARD", "PAPER_BIN", 4.65358],
    ["GLASS_PACKAGING", "GLASS_COLLECTION_CONTAINER", 4.65358], ["DEPOSIT_RETURN", "DEPOSIT_RETURN_POINT", 4.65358],
    ["RESIDUAL", "RESIDUAL_WASTE_BIN", 4.65358], ["ORGANIC", "BIO_BIN_OR_COMPOST", 9.00687],
  ];
  for (const factor of factors) {
    await runner.query(`INSERT INTO carbon_factors(factor_set_id,waste_category,treatment_route,kg_co2e_per_tonne)
      VALUES($1,$2,$3,$4) ON CONFLICT(factor_set_id,waste_category,treatment_route) DO UPDATE SET kg_co2e_per_tonne=EXCLUDED.kg_co2e_per_tonne`, [setId, ...factor]);
  }
}

async function seedUsers(runner: QueryRunner): Promise<void> {
  if (appConfig().nodeEnv === "production") return;
  for (const [username, displayName, plan] of [["demo", "Emma", "FREE"], ["plusdemo", "Plus Demo", "PLUS"]]) {
    const hash = await argon2.hash("Demo12345!");
    const users = await runner.query(`INSERT INTO users(username,password_hash,display_name) VALUES($1,$2,$3)
      ON CONFLICT(username) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id`, [username, hash, displayName]) as Array<{ id: string }>;
    await runner.query(`INSERT INTO subscriptions(user_id,plan_code) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,updated_at=now()`, [users[0]!.id, plan]);
  }
}

async function seed(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: "all" });
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await seedPlans(runner);
    await seedRules(runner);
    await seedCarbon(runner);
    await seedUsers(runner);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
  process.stdout.write(`Seed complete. Active rule set: ${RULE_VERSION}.\n`);
}

void seed().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Seed failed"}\n`);
  process.exitCode = 1;
});
