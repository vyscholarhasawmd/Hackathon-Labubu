import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import {
  AuthController,
  CountriesController,
  HealthController,
  RecordsController,
  ScansController,
  SubscriptionController,
} from "./controllers";
import { AuthGuard } from "./auth.guard";
import { MemoryStore } from "./memory.store";
import { OpenAiIdentificationService } from "./openai-identification.service";
import { RuleEngine } from "./rule.engine";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    JwtModule.register({
      global: true,
      secret:
        process.env.JWT_ACCESS_SECRET ??
        "local-demo-secret-change-before-sharing",
      signOptions: { expiresIn: "15m" },
    }),
  ],
  controllers: [
    AuthController,
    HealthController,
    CountriesController,
    ScansController,
    RecordsController,
    SubscriptionController,
  ],
  providers: [
    MemoryStore,
    RuleEngine,
    AuthGuard,
    OpenAiIdentificationService,
  ],
})
export class AppModule {}