import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AnalyticsDto,
  CountryCode,
  CountryDto,
  IdentificationResult,
  PaginatedWasteRecordsDto,
  PaymentTransactionDto,
  PlanDto,
  ScanDto,
  SubscriptionDto,
  WasteCategory,
  WasteRecordDto,
} from "@resort/contracts";
import { randomUUID } from "node:crypto";
import type { QueryRunner } from "typeorm";
import {
  DataStore,
  type CarbonFactor,
  type MediaRecord,
  type RecordFilters,
  type RecordInput,
  type RefreshSessionInput,
  type ScanReservation,
  type StoredUser,
} from "./data.store";
import { DatabaseService } from "./database/database.service";
import { currentWeek, dateKey } from "./time";

type Row = Record<string, unknown>;

const text = (value: unknown): string => String(value ?? "");
const nullableText = (value: unknown): string | null => value == null ? null : String(value);
const number = (value: unknown): number => Number(value ?? 0);
const bool = (value: unknown): boolean => Boolean(value);
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const dateOnly = (value: unknown): string => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`
  : String(value).slice(0, 10);

function mapUser(row: Row): StoredUser {
  return {
    id: text(row.id),
    username: text(row.username),
    displayName: text(row.display_name),
    countryCode: "DE",
    timezone: text(row.timezone),
    passwordHash: text(row.password_hash),
  };
}

function mapScan(row: Row): ScanDto {
  return {
    id: text(row.id),
    status: text(row.status) as ScanDto["status"],
    provider: text(row.ai_provider) as ScanDto["provider"],
    model: nullableText(row.ai_model),
    promptVersion: text(row.prompt_version),
    countryCode: "DE",
    createdAt: iso(row.created_at),
    identification: (row.identification_json ?? null) as IdentificationResult | null,
    errorCode: nullableText(row.error_code),
    thumbnailUrl: bool(row.has_media) ? `/api/v1/scans/${text(row.id)}/thumbnail` : null,
  };
}

function mapRecord(row: Row): WasteRecordDto {
  return {
    id: text(row.id),
    scanId: text(row.scan_id),
    identifiedName: text(row.identified_name),
    wasteTypeLabel: text(row.waste_type_label),
    category: text(row.waste_category) as WasteCategory,
    primaryMaterial: text(row.primary_material),
    materialLabel: text(row.material_label),
    disposalRoute: text(row.disposal_route),
    binLabel: text(row.bin_label),
    preparationSteps: (row.preparation_steps_json ?? []) as string[],
    reuseSuggestions: (row.reuse_suggestions_json ?? []) as string[],
    environmentalImpactSummary: text(row.environmental_impact_summary),
    estimatedWeightGrams: number(row.estimated_weight_grams),
    weightSource: text(row.weight_source) as WasteRecordDto["weightSource"],
    weightConfidence: row.weight_confidence == null ? null : number(row.weight_confidence),
    estimatedDisposalCo2eKg: row.estimated_disposal_co2e_kg == null ? null : number(row.estimated_disposal_co2e_kg),
    carbonMethodologyVersion: nullableText(row.carbon_methodology_version),
    carbonBoundary: nullableText(row.carbon_boundary),
    classificationConfidence: number(row.classification_confidence),
    requiresLocalGuidance: bool(row.requires_local_guidance),
    localWarning: nullableText(row.local_warning),
    ruleSetVersion: text(row.rule_set_version),
    ruleSetEffectiveFrom: dateOnly(row.rule_set_effective_from),
    sourceUrls: (row.source_snapshot_json ?? []) as string[],
    analysisProvider: text(row.analysis_provider) as WasteRecordDto["analysisProvider"],
    analysisModel: nullableText(row.analysis_model),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    thumbnailUrl: bool(row.has_media) ? `/api/v1/scans/${text(row.scan_id)}/thumbnail` : null,
  };
}

function mapTransaction(row: Row): PaymentTransactionDto {
  return {
    id: text(row.id),
    planCode: text(row.plan_code) as PaymentTransactionDto["planCode"],
    amountCents: number(row.amount_cents),
    currency: "EUR",
    status: text(row.status) as PaymentTransactionDto["status"],
    provider: "FAKE",
    providerReference: text(row.provider_reference),
    failureCode: nullableText(row.failure_code),
    createdAt: iso(row.created_at),
  };
}

@Injectable()
export class PostgresStore extends DataStore {
  constructor(private readonly database: DatabaseService) { super(); }

  async findUserByUsername(username: string): Promise<StoredUser | undefined> {
    const rows = await this.database.query(`SELECT * FROM users WHERE username=$1`, [username.toLowerCase()]);
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async getUser(id: string): Promise<StoredUser> {
    const rows = await this.database.query(`SELECT * FROM users WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException("User not found");
    return mapUser(rows[0]);
  }

  async register(username: string, passwordHash: string): Promise<StoredUser> {
    try {
      const rows = await this.database.query(`INSERT INTO users(username,password_hash,display_name) VALUES($1,$2,$3) RETURNING *`, [username.toLowerCase(), passwordHash, username]);
      const user = mapUser(rows[0]!);
      await this.database.query(`INSERT INTO subscriptions(user_id,plan_code) VALUES($1,'FREE')`, [user.id]);
      return user;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new ConflictException("Username is not available");
      throw error;
    }
  }

  async createRefreshSession(input: RefreshSessionInput): Promise<void> {
    await this.database.query(`INSERT INTO refresh_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)`, [input.userId, input.tokenHash, input.expiresAt]);
  }

  async rotateRefreshSession(currentHash: string, nextHash: string, nextExpiresAt: Date): Promise<StoredUser> {
    return this.database.transaction(async (runner) => {
      const rows = await runner.query(`SELECT rs.*,u.* FROM refresh_sessions rs JOIN users u ON u.id=rs.user_id WHERE rs.token_hash=$1 FOR UPDATE OF rs`, [currentHash]) as Row[];
      const row = rows[0];
      if (!row || row.revoked_at || new Date(text(row.expires_at)) <= new Date()) throw new NotFoundException("Session not found");
      const inserted = await runner.query(`INSERT INTO refresh_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3) RETURNING id`, [row.user_id, nextHash, nextExpiresAt]) as Row[];
      await runner.query(`UPDATE refresh_sessions SET revoked_at=now(),rotated_to_session_id=$2,last_used_at=now() WHERE token_hash=$1`, [currentHash, inserted[0]!.id]);
      return mapUser(row);
    });
  }

  async revokeRefreshSession(tokenHash: string): Promise<void> {
    await this.database.query(`UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,now()),last_used_at=now() WHERE token_hash=$1`, [tokenHash]);
  }

  async countries(): Promise<CountryDto[]> {
    const rows = await this.database.query(`SELECT c.*,rs.version,rs.effective_from,rs.source_snapshot_json FROM countries c LEFT JOIN rule_sets rs ON rs.id=c.active_rule_set_id ORDER BY c.enabled DESC,c.name`);
    return rows.map((row) => ({
      code: text(row.code), name: text(row.name), enabled: bool(row.enabled),
      ...(bool(row.coming_soon) ? { label: "Coming soon" } : {}),
      ...(row.version ? { ruleSetVersion: text(row.version), ruleSetEffectiveFrom: dateOnly(row.effective_from), sourceUrls: ((row.source_snapshot_json ?? []) as Array<{ source_url?: string }>).map((source) => source.source_url).filter((url): url is string => Boolean(url)) } : {}),
    }));
  }

  async plans(): Promise<PlanDto[]> {
    const rows = await this.database.query(`SELECT * FROM subscription_plans ORDER BY price_cents`);
    return rows.map((row) => ({ code: text(row.code) as PlanDto["code"], name: text(row.name), weeklyLimit: number(row.weekly_image_limit), priceCents: number(row.price_cents), accuracyLabel: text(row.accuracy_label), qualityTier: text(row.quality_tier) as PlanDto["qualityTier"], features: row.features_json as string[], checkoutEnabled: bool(row.checkout_enabled), comingSoon: bool(row.coming_soon) || undefined }));
  }

  async subscription(userId: string): Promise<SubscriptionDto> {
    const userRows = await this.database.query(`SELECT u.timezone,p.code,p.weekly_image_limit FROM users u JOIN subscriptions s ON s.user_id=u.id JOIN subscription_plans p ON p.code=s.plan_code WHERE u.id=$1`, [userId]);
    const row = userRows[0];
    if (!row) throw new NotFoundException("Subscription not found");
    const week = currentWeek(text(row.timezone));
    const usageRows = await this.database.query(`SELECT used_count FROM weekly_usage WHERE user_id=$1 AND week_start=$2`, [userId, week.weekStart]);
    const used = number(usageRows[0]?.used_count);
    const limit = number(row.weekly_image_limit);
    return { plan: text(row.code) as SubscriptionDto["plan"], weeklyLimit: limit, used, remaining: Math.max(0, limit - used), weekStart: week.weekStart, resetsAt: week.resetsAt };
  }

  private scanSelect(alias = "s"): string {
    return `SELECT ${alias}.*,EXISTS(SELECT 1 FROM scan_media m WHERE m.scan_id=${alias}.id) AS has_media FROM scan_jobs ${alias}`;
  }

  async findScanByIdempotency(userId: string, key: string): Promise<ScanDto | undefined> {
    const rows = await this.database.query(`${this.scanSelect()} WHERE s.user_id=$1 AND s.idempotency_key=$2`, [userId, key]);
    return rows[0] ? mapScan(rows[0]) : undefined;
  }

  async beginScan(userId: string, key: string, countryCode: CountryCode, provider: "MOCK" | "OPENAI", model: string | null, promptVersion: string): Promise<ScanReservation> {
    try {
      return await this.database.transaction(async (runner) => {
        const duplicate = await runner.query(`SELECT s.*,EXISTS(SELECT 1 FROM scan_media m WHERE m.scan_id=s.id) AS has_media FROM scan_jobs s WHERE s.user_id=$1 AND s.idempotency_key=$2`, [userId, key]) as Row[];
        if (duplicate[0]) return { scan: mapScan(duplicate[0]), existing: true };

        const subscriptionRows = await runner.query(`SELECT u.timezone,s.plan_code,p.weekly_image_limit,p.quality_tier,rs.version FROM users u JOIN subscriptions s ON s.user_id=u.id JOIN subscription_plans p ON p.code=s.plan_code JOIN countries c ON c.code=$2 LEFT JOIN rule_sets rs ON rs.id=c.active_rule_set_id WHERE u.id=$1 FOR UPDATE OF s`, [userId, countryCode]) as Row[];
        const subscription = subscriptionRows[0];
        if (!subscription) throw new NotFoundException("Subscription or country not found");
        const week = currentWeek(text(subscription.timezone));
        await runner.query(`INSERT INTO weekly_usage(user_id,week_start,used_count) VALUES($1,$2,0) ON CONFLICT(user_id,week_start) DO NOTHING`, [userId, week.weekStart]);
        const usageRows = await runner.query(`SELECT * FROM weekly_usage WHERE user_id=$1 AND week_start=$2 FOR UPDATE`, [userId, week.weekStart]) as Row[];
        const used = number(usageRows[0]!.used_count);
        const limit = number(subscription.weekly_image_limit);
        if (used >= limit) throw new HttpException({ code: "WEEKLY_SCAN_LIMIT_REACHED", message: "You have reached your weekly scan limit.", details: { used, weeklyLimit: limit, remaining: 0, weekStart: week.weekStart, resetsAt: week.resetsAt } }, HttpStatus.TOO_MANY_REQUESTS);
        const scanRows = await runner.query(`INSERT INTO scan_jobs(user_id,idempotency_key,status,country_code,rule_set_version_snapshot,subscription_plan_snapshot,quality_tier_snapshot,ai_provider,ai_model,prompt_version,quota_reserved) VALUES($1,$2,'PROCESSING',$3,$4,$5,$6,$7,$8,$9,true) RETURNING *,false AS has_media`, [userId, key, countryCode, subscription.version, subscription.plan_code, subscription.quality_tier, provider, model, promptVersion]) as Row[];
        await runner.query(`UPDATE weekly_usage SET used_count=used_count+1,updated_at=now() WHERE user_id=$1 AND week_start=$2`, [userId, week.weekStart]);
        return { scan: mapScan(scanRows[0]!), existing: false };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        const existing = await this.findScanByIdempotency(userId, key);
        if (existing) return { scan: existing, existing: true };
      }
      throw error;
    }
  }

  async completeScan(userId: string, scanId: string, identification: IdentificationResult, latencyMs: number): Promise<ScanDto> {
    const rows = await this.database.query(`UPDATE scan_jobs SET status='ANALYZED',identification_json=$3::jsonb,ai_latency_ms=$4,error_code=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 AND status='PROCESSING' RETURNING *,EXISTS(SELECT 1 FROM scan_media m WHERE m.scan_id=scan_jobs.id) AS has_media`, [scanId, userId, JSON.stringify(identification), latencyMs]);
    if (!rows[0]) return this.getScan(userId, scanId);
    return mapScan(rows[0]);
  }

  async failScan(userId: string, scanId: string, errorCode: string): Promise<void> {
    await this.database.transaction(async (runner) => {
      const rows = await runner.query(`SELECT s.*,u.timezone FROM scan_jobs s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE OF s`, [scanId, userId]) as Row[];
      const scan = rows[0];
      if (!scan) throw new NotFoundException("Scan not found");
      if (scan.status !== "PROCESSING") return;
      await runner.query(`UPDATE scan_jobs SET status='FAILED',error_code=$3,quota_released_at=CASE WHEN quota_reserved THEN now() ELSE quota_released_at END,quota_reserved=false,updated_at=now() WHERE id=$1 AND user_id=$2`, [scanId, userId, errorCode]);
      if (bool(scan.quota_reserved)) {
        const week = currentWeek(text(scan.timezone), new Date(scan.created_at as string));
        await runner.query(`UPDATE weekly_usage SET used_count=GREATEST(0,used_count-1),updated_at=now() WHERE user_id=$1 AND week_start=$2`, [userId, week.weekStart]);
      }
    });
  }

  async getScan(userId: string, scanId: string): Promise<ScanDto> {
    const rows = await this.database.query(`${this.scanSelect()} WHERE s.id=$1 AND s.user_id=$2`, [scanId, userId]);
    if (!rows[0]) throw new NotFoundException("Scan not found");
    return mapScan(rows[0]);
  }

  async saveMedia(userId: string, scanId: string, input: Omit<MediaRecord, "id"> & { byteSize: number; width: number; height: number; sha256: string; deleteAfter: Date }): Promise<void> {
    await this.database.query(`INSERT INTO scan_media(scan_id,user_id,storage_key,mime_type,byte_size,width,height,sha256,delete_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(scan_id) DO NOTHING`, [scanId, userId, input.storageKey, input.mimeType, input.byteSize, input.width, input.height, input.sha256, input.deleteAfter]);
  }

  async getMedia(userId: string, scanId: string): Promise<MediaRecord> {
    const rows = await this.database.query(`SELECT id,storage_key,mime_type FROM scan_media WHERE scan_id=$1 AND user_id=$2`, [scanId, userId]);
    if (!rows[0]) throw new NotFoundException("Image not found");
    return { id: text(rows[0].id), storageKey: text(rows[0].storage_key), mimeType: text(rows[0].mime_type) };
  }

  async rejectScan(userId: string, scanId: string, reasonCode?: string, comment?: string): Promise<void> {
    await this.database.transaction(async (runner) => {
      const rows = await runner.query(`SELECT * FROM scan_jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, [scanId, userId]) as Row[];
      const scan = rows[0];
      if (!scan) throw new NotFoundException("Scan not found");
      if (scan.status !== "ANALYZED") throw new ConflictException("SCAN_ALREADY_DECIDED");
      await runner.query(`INSERT INTO scan_feedback(scan_id,user_id,reason_code,comment,identification_snapshot_json) VALUES($1,$2,$3,$4,$5::jsonb)`, [scanId, userId, reasonCode ?? null, comment ?? null, JSON.stringify(scan.identification_json)]);
      await runner.query(`UPDATE scan_jobs SET status='REJECTED',decided_at=now(),updated_at=now() WHERE id=$1`, [scanId]);
    });
  }

  async acceptScan(userId: string, scanId: string, record: RecordInput): Promise<WasteRecordDto> {
    return this.database.transaction(async (runner) => {
      const scanRows = await runner.query(`SELECT * FROM scan_jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, [scanId, userId]) as Row[];
      const scan = scanRows[0];
      if (!scan) throw new NotFoundException("Scan not found");
      if (scan.status !== "ANALYZED") throw new ConflictException("SCAN_ALREADY_DECIDED");
      const rows = await runner.query(`INSERT INTO waste_records(scan_id,user_id,identified_name,waste_type_label,waste_category,primary_material,material_label,disposal_route,bin_label,preparation_steps_json,reuse_suggestions_json,environmental_impact_summary,classification_confidence,estimated_weight_grams,weight_source,weight_confidence,estimated_disposal_co2e_kg,carbon_methodology_version,carbon_boundary,requires_local_guidance,local_warning,rule_set_version,rule_set_effective_from,source_snapshot_json)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb)
        RETURNING *,EXISTS(SELECT 1 FROM scan_media m WHERE m.scan_id=$1) AS has_media`, [scanId,userId,record.identifiedName,record.wasteTypeLabel,record.category,record.primaryMaterial,record.materialLabel,record.disposalRoute,record.binLabel,JSON.stringify(record.preparationSteps),JSON.stringify(record.reuseSuggestions),record.environmentalImpactSummary,record.classificationConfidence,record.estimatedWeightGrams,record.weightSource,record.weightConfidence,record.estimatedDisposalCo2eKg,record.carbonMethodologyVersion,record.carbonBoundary,record.requiresLocalGuidance,record.localWarning,record.ruleSetVersion,record.ruleSetEffectiveFrom,JSON.stringify(record.sourceUrls)]) as Row[];
      await runner.query(`UPDATE scan_jobs SET status='ACCEPTED',decided_at=now(),updated_at=now() WHERE id=$1`, [scanId]);
      return mapRecord({ ...rows[0]!,analysis_provider:scan.ai_provider,analysis_model:scan.ai_model });
    });
  }

  private async recordRows(userId: string, clause: string, params: unknown[]): Promise<Row[]> {
    return this.database.query(`SELECT w.*,s.ai_provider AS analysis_provider,s.ai_model AS analysis_model,EXISTS(SELECT 1 FROM scan_media m WHERE m.scan_id=w.scan_id) AS has_media FROM waste_records w JOIN scan_jobs s ON s.id=w.scan_id WHERE w.user_id=$1 ${clause}`, [userId, ...params]);
  }

  async listRecords(userId: string, filters: RecordFilters): Promise<PaginatedWasteRecordsDto> {
    const values: unknown[] = []; const clauses: string[] = [];
    const add = (sql: string, value: unknown): void => { values.push(value); clauses.push(sql.replace("?", `$${values.length + 1}`)); };
    if (filters.from) add(`w.created_at>=?`, filters.from);
    if (filters.to) add(`w.created_at<=?`, filters.to);
    if (filters.category) add(`w.waste_category=?`, filters.category);
    if (filters.route) add(`w.disposal_route=?`, filters.route);
    const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";
    const countRows = await this.database.query(`SELECT count(*)::integer AS total FROM waste_records w WHERE w.user_id=$1 ${where}`, [userId, ...values]);
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await this.recordRows(userId, `${where} ORDER BY w.created_at DESC LIMIT $${values.length + 2} OFFSET $${values.length + 3}`, [...values, filters.pageSize, offset]);
    return { items: rows.map(mapRecord), page: filters.page, pageSize: filters.pageSize, total: number(countRows[0]?.total) };
  }

  async getRecord(userId: string, recordId: string): Promise<WasteRecordDto> {
    const rows = await this.recordRows(userId, `AND w.id=$2`, [recordId]);
    if (!rows[0]) throw new NotFoundException("Waste record not found");
    return mapRecord(rows[0]);
  }

  async updateWeight(userId: string, recordId: string, grams: number): Promise<WasteRecordDto> {
    const current = await this.getRecord(userId, recordId);
    const factor = await this.carbonFactor(current.category, current.disposalRoute);
    const co2 = factor ? (grams / 1_000_000) * factor.kgCo2ePerTonne : null;
    await this.database.query(`UPDATE waste_records SET estimated_weight_grams=$3,weight_source='USER',weight_confidence=NULL,estimated_disposal_co2e_kg=$4,carbon_factor_id=$5,carbon_methodology_version=$6,carbon_boundary=$7,updated_at=now() WHERE id=$1 AND user_id=$2`, [recordId,userId,grams,co2,factor?.id ?? null,factor?.methodologyVersion ?? null,factor?.boundary ?? null]);
    return this.getRecord(userId,recordId);
  }

  async deleteRecord(userId: string, recordId: string): Promise<string | null> {
    return this.database.transaction(async (runner) => {
      const rows = await runner.query(`SELECT w.scan_id,m.storage_key FROM waste_records w LEFT JOIN scan_media m ON m.scan_id=w.scan_id WHERE w.id=$1 AND w.user_id=$2 FOR UPDATE OF w`, [recordId,userId]) as Row[];
      if (!rows[0]) throw new NotFoundException("Waste record not found");
      await runner.query(`DELETE FROM waste_records WHERE id=$1 AND user_id=$2`, [recordId,userId]);
      return nullableText(rows[0].storage_key);
    });
  }

  async carbonFactor(category: WasteCategory, route: string): Promise<CarbonFactor | null> {
    const rows = await this.database.query(`SELECT f.id,f.kg_co2e_per_tonne,s.version,s.boundary FROM carbon_factors f JOIN carbon_factor_sets s ON s.id=f.factor_set_id WHERE f.waste_category=$1 AND f.treatment_route=$2 ORDER BY s.published_at DESC NULLS LAST LIMIT 1`, [category,route]);
    return rows[0] ? { id: text(rows[0].id), kgCo2ePerTonne: number(rows[0].kg_co2e_per_tonne), methodologyVersion: text(rows[0].version), boundary: text(rows[0].boundary) } : null;
  }

  async analytics(userId: string, from?: string, to?: string): Promise<AnalyticsDto> {
    const user = await this.getUser(userId); const week = currentWeek(user.timezone);
    const start = from ?? week.dates[0]!; const end = to ?? `${week.dates[6]}T23:59:59.999Z`;
    const rows = await this.recordRows(userId, `AND w.created_at >= $2 AND w.created_at <= $3 ORDER BY w.created_at`, [start,end]);
    const records = rows.map(mapRecord); const binMap = new Map<string,{count:number;weight:number}>();
    for (const record of records) { const value = binMap.get(record.binLabel) ?? { count: 0, weight: 0 }; value.count += 1; value.weight += record.estimatedWeightGrams; binMap.set(record.binLabel,value); }
    const dates = from || to ? [...new Set(records.map((record) => dateKey(new Date(record.createdAt), user.timezone)))].sort() : week.dates;
    const daily = dates.map((date) => { const items = records.filter((record) => dateKey(new Date(record.createdAt),user.timezone) === date); return { date,count:items.length,weightGrams:items.reduce((sum,item)=>sum+item.estimatedWeightGrams,0),disposalCo2eKg:items.reduce((sum,item)=>sum+(item.estimatedDisposalCo2eKg ?? 0),0) }; });
    const packages = records.filter((record) => record.category === "LIGHTWEIGHT_PACKAGING").length;
    const special = records.filter((record) => ["BATTERY","E_WASTE","HAZARDOUS_WASTE"].includes(record.category)).length;
    const suggestions = special ? [{ code:"SAFE_RETURN",title:"Combine a safe collection-point trip",action:"Keep batteries, e-waste and hazardous items dry and separate, then use an approved collection point.",evidence:`${special} accepted special-waste item${special === 1 ? "" : "s"} this period.` }] : [{ code:"REFILL",title:"Try one refill or reusable swap",action:"Replace one frequently scanned disposable package with a refill or reusable option.",evidence:`${packages} lightweight package${packages === 1 ? "" : "s"} accepted this period.` }];
    return { totalAccepted:records.length,totalWeightGrams:records.reduce((sum,item)=>sum+item.estimatedWeightGrams,0),totalDisposalCo2eKg:records.reduce((sum,item)=>sum+(item.estimatedDisposalCo2eKg ?? 0),0),recordsWithoutCarbonFactor:records.filter((item)=>item.estimatedDisposalCo2eKg == null).length,daily,dailyCounts:daily.map((item)=>item.count),categories:[...binMap].map(([label,value])=>({ category:"BIN" as const,label,count:value.count,weightGrams:value.weight })).sort((a,b)=>b.count-a.count),suggestions };
  }

  private async subscriptionWithRunner(runner: QueryRunner, userId: string): Promise<SubscriptionDto> {
    const rows = await runner.query(`SELECT u.timezone,p.code,p.weekly_image_limit FROM users u JOIN subscriptions s ON s.user_id=u.id JOIN subscription_plans p ON p.code=s.plan_code WHERE u.id=$1`, [userId]) as Row[];
    if (!rows[0]) throw new NotFoundException("Subscription not found");
    const week = currentWeek(text(rows[0].timezone));
    const usage = await runner.query(`SELECT used_count FROM weekly_usage WHERE user_id=$1 AND week_start=$2`, [userId,week.weekStart]) as Row[];
    const used=number(usage[0]?.used_count); const limit=number(rows[0].weekly_image_limit);
    return { plan:text(rows[0].code) as SubscriptionDto["plan"],weeklyLimit:limit,used,remaining:Math.max(0,limit-used),weekStart:week.weekStart,resetsAt:week.resetsAt };
  }

  async checkout(userId: string, planCode: "PLUS" | "HOUSEHOLD", paymentToken: "tok_demo_visa" | "tok_demo_declined"): Promise<{ subscription: SubscriptionDto; transaction: PaymentTransactionDto }> {
    if (planCode === "HOUSEHOLD") throw new HttpException({ code:"PLAN_NOT_AVAILABLE",message:"Household is coming soon." },HttpStatus.CONFLICT);
    const result = await this.database.transaction(async (runner) => {
      const plans = await runner.query(`SELECT * FROM subscription_plans WHERE code=$1`,[planCode]) as Row[]; const plan=plans[0];
      if (!plan || !bool(plan.checkout_enabled)) throw new HttpException("PLAN_NOT_AVAILABLE",HttpStatus.CONFLICT);
      const status = paymentToken === "tok_demo_declined" ? "DECLINED" : "SUCCEEDED"; const reference=`fake_${randomUUID()}`;
      const transactions = await runner.query(`INSERT INTO payment_transactions(user_id,plan_code,amount_cents,status,provider,provider_reference,failure_code) VALUES($1,$2,$3,$4,'FAKE',$5,$6) RETURNING *`,[userId,planCode,plan.price_cents,status,reference,status === "DECLINED" ? "FAKE_PAYMENT_DECLINED" : null]) as Row[];
      if (status === "SUCCEEDED") await runner.query(`UPDATE subscriptions SET plan_code=$2,status='ACTIVE',updated_at=now() WHERE user_id=$1`,[userId,planCode]);
      return { transaction:mapTransaction(transactions[0]!),subscription:await this.subscriptionWithRunner(runner,userId),declined:status === "DECLINED" };
    });
    if (result.declined) throw new HttpException({ code:"FAKE_PAYMENT_DECLINED",message:"The demo payment was declined.",transaction:result.transaction },HttpStatus.PAYMENT_REQUIRED);
    return { transaction:result.transaction,subscription:result.subscription };
  }

  async switchToFree(userId: string): Promise<SubscriptionDto> { await this.database.query(`UPDATE subscriptions SET plan_code='FREE',updated_at=now() WHERE user_id=$1`,[userId]); return this.subscription(userId); }
  async transactions(userId: string): Promise<PaymentTransactionDto[]> { const rows=await this.database.query(`SELECT * FROM payment_transactions WHERE user_id=$1 ORDER BY created_at DESC`,[userId]); return rows.map(mapTransaction); }
  async readiness(): Promise<{ database:"ok"|"unavailable";ruleSetVersion:string|null }> { try { const rows=await this.database.query(`SELECT rs.version FROM countries c LEFT JOIN rule_sets rs ON rs.id=c.active_rule_set_id WHERE c.code='DE'`); return { database:"ok",ruleSetVersion:nullableText(rows[0]?.version) }; } catch { return { database:"unavailable",ruleSetVersion:null }; } }
}
