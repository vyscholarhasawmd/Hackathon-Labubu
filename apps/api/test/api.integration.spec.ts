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
});
