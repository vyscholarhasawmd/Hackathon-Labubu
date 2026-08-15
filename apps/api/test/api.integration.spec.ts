import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("Re-Sort API", () => {
  let app: INestApplication;
  let token = "";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ username: "demo", password: "Demo12345!" }).expect(201);
    token = login.body.accessToken as string;
  });

  afterAll(async () => { await app.close(); });

  it("reports mock AI ready", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health/ready").expect(200);
    expect(response.body.aiMode).toBe("mock");
  });

  it("uploads, identifies and accepts a photo", async () => {
    const image = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#f5f0e6" } }).png().toBuffer();
    const scan = await request(app.getHttpServer()).post("/api/v1/scans").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", "0f77d57a-2898-4b39-99ca-d5d3ed3fc999").attach("image", image, { filename: "cup.png", contentType: "image/png" }).expect(201);
    expect(scan.body.identification.primaryObject).toBe("Yogurt cup");
    const decision = await request(app.getHttpServer()).post(`/api/v1/scans/${scan.body.id}/decision`).set("Authorization", `Bearer ${token}`).send({ decision: "ACCEPT" }).expect(201);
    expect(decision.body.wasteRecordId).toBeTruthy();
  });

  it("returns an existing scan for the same idempotency key without consuming quota twice", async () => {
    const image = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#dde5d8" } }).png().toBuffer();
    const key = "92aba2c5-f0fc-48f7-958d-5b272db325cc";
    const before = await request(app.getHttpServer()).get("/api/v1/subscriptions/current").set("Authorization", `Bearer ${token}`).expect(200);
    const first = await request(app.getHttpServer()).post("/api/v1/scans").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).attach("image", image, { filename: "item.png", contentType: "image/png" }).expect(201);
    const second = await request(app.getHttpServer()).post("/api/v1/scans").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).attach("image", image, { filename: "item.png", contentType: "image/png" }).expect(201);
    const after = await request(app.getHttpServer()).get("/api/v1/subscriptions/current").set("Authorization", `Bearer ${token}`).expect(200);

    expect(second.body.id).toBe(first.body.id);
    expect(after.body.used).toBe(before.body.used + 1);
  });

  it("groups this week's category summary by the actual disposal bin", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/analytics/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const categories = response.body.categories as Array<{ label: string; count: number }>;
    expect(categories.some((item) => item.label === "Yellow bin or sack" && item.count > 0)).toBe(true);
    expect(categories.some((item) => ["Plastic", "Paper", "Metal", "Glass"].includes(item.label))).toBe(false);
  });
});
