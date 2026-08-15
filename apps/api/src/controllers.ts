import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import * as argon2 from "argon2";
import { memoryStorage } from "multer";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { AuthResponse } from "@resort/contracts";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard";
import { CheckoutDto, DecisionDto, LoginDto, RegisterDto, WeightDto } from "./dto";
import { MemoryStore } from "./memory.store";
import { OpenAiIdentificationService } from "./openai-identification.service";
import { RULE_SET_VERSION, RULE_SOURCES, RuleEngine } from "./rule.engine";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(MemoryStore) private readonly store: MemoryStore, @Inject(JwtService) private readonly jwt: JwtService) {}
  private response(user: { id: string; username: string; displayName: string }): AuthResponse {
    return { accessToken: this.jwt.sign({ sub: user.id, username: user.username }), user: { id: user.id, username: user.username, displayName: user.displayName, countryCode: "DE" } };
  }
  @Post("login") async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    const user = this.store.findUserByUsername(dto.username);
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) throw new HttpException("Invalid username or password", HttpStatus.UNAUTHORIZED);
    return this.response(user);
  }
  @Post("register") async register(@Body() dto: RegisterDto): Promise<AuthResponse> { return this.response(await this.store.register(dto.username, dto.password)); }
  @Get("me") @UseGuards(AuthGuard) @ApiBearerAuth() me(@Req() request: AuthenticatedRequest) {
    const user = this.store.getUser(request.userId); return { id: user.id, username: user.username, displayName: user.displayName, countryCode: "DE", subscription: this.store.subscription(user.id) };
  }
  @Post("logout") @UseGuards(AuthGuard) @HttpCode(204) logout(): void {}
}

@ApiTags("operations")
@Controller("health")
export class HealthController {
  @Get("live") live() { return { status: "ok" }; }
  @Get("ready") ready() { return { status: "ok", dataMode: process.env.DATA_MODE ?? "memory", aiMode: process.env.AI_MODE ?? "mock", postgres: process.env.DATA_MODE === "postgres" ? "configured" : "optional" }; }
}

@ApiTags("countries")
@Controller("countries")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class CountriesController {
  @Get() all() { return [{ code: "DE", name: "Germany", enabled: true, ruleSetVersion: RULE_SET_VERSION, sourceUrls: RULE_SOURCES }, { code: "AT", name: "Austria", enabled: false, label: "Coming soon" }, { code: "FR", name: "France", enabled: false, label: "Coming soon" }, { code: "NL", name: "Netherlands", enabled: false, label: "Coming soon" }]; }
}

@ApiTags("scans")@ApiTags("scans")
@Controller("scans")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ScansController {
  constructor(
    @Inject(MemoryStore)
    private readonly store: MemoryStore,
    @Inject(RuleEngine)
    private readonly rules: RuleEngine,
    @Inject(OpenAiIdentificationService)
    private readonly vision: OpenAiIdentificationService,
  ) {}

  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("image", {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async create(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers("idempotency-key") key?: string,
  ) {
    const requestKey = key ?? randomUUID();
    const existingScan = this.store.findScanByIdempotency(
      request.userId,
      requestKey,
    );

    if (existingScan) {
      return existingScan;
    }

    if (!file) {
      throw new BadRequestException(
        "Multipart field 'image' is required",
      );
    }

    let metadata: sharp.Metadata;

    try {
      metadata = await sharp(file.buffer, {
        limitInputPixels: 25_000_000,
      }).metadata();
    } catch {
      throw new BadRequestException(
        "Image is malformed or unsupported",
      );
    }

    if (
      !metadata.width ||
      !metadata.height ||
      !["jpeg", "png", "webp", "heif"].includes(
        metadata.format ?? "",
      )
    ) {
      throw new BadRequestException(
        "Only JPEG, PNG, WebP and HEIF images are supported",
      );
    }

    const processedImage = await sharp(file.buffer, {
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    const identification =
      process.env.AI_MODE === "openai"
        ? await this.vision.identify(processedImage)
        : undefined;

    return this.store.createScan(
      request.userId,
      requestKey,
      identification,
    );
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.store.getScan(id);
  }

  @Post(":id/decision")
  decide(
    @Param("id") id: string,
    @Body() dto: DecisionDto,
  ) {
    const scan = this.store.decideScan(
      id,
      dto.decision === "ACCEPT"
        ? "ACCEPTED"
        : "REJECTED",
    );

    if (dto.decision === "REJECT") {
      return {
        scanId: id,
        status: scan.status,
        message: "Your feedback has been received",
      };
    }

    const record = this.store.addRecord(
      this.rules.classify(
        scan.id,
        scan.identification,
      ),
    );

    return {
      scanId: id,
      status: scan.status,
      wasteRecordId: record.id,
    };
  }
}
@ApiTags("records")
@Controller()
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class RecordsController {
  constructor(@Inject(MemoryStore) private readonly store: MemoryStore) {}
  @Get("waste-records") list() { return { items: this.store.listRecords(), page: 1, pageSize: 20, total: this.store.listRecords().length }; }
  @Get("waste-records/:id") get(@Param("id") id: string) { return this.store.getRecord(id); }
  @Patch("waste-records/:id/weight") weight(@Param("id") id: string, @Body() dto: WeightDto) { return this.store.updateWeight(id, dto.grams); }
  @Delete("waste-records/:id") @HttpCode(204) remove(@Param("id") id: string): void { this.store.deleteRecord(id); }
  @Get("analytics/summary") summary() { return this.store.analytics(); }
}

@ApiTags("subscriptions")
@Controller("subscriptions")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(@Inject(MemoryStore) private readonly store: MemoryStore) {}
  @Get("plans") plans() { return this.store.getPlans(); }
  @Get("current") current(@Req() request: AuthenticatedRequest) { return this.store.subscription(request.userId); }
  @Post("fake-checkout") checkout(@Req() request: AuthenticatedRequest, @Body() dto: CheckoutDto) {
    if (dto.planCode === "HOUSEHOLD") throw new HttpException("PLAN_NOT_AVAILABLE", HttpStatus.CONFLICT);
    if (dto.paymentMethodToken === "tok_demo_declined") throw new HttpException("FAKE_PAYMENT_DECLINED", HttpStatus.PAYMENT_REQUIRED);
    return { message: "Payment successful — Plus is now active.", subscription: this.store.upgrade(request.userId, "PLUS"), providerReference: `fake_pay_${randomUUID()}` };
  }
  @Post("switch-to-free") free(@Req() request: AuthenticatedRequest) { return this.store.upgrade(request.userId, "FREE"); }
}
