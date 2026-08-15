import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthController, CountriesController, HealthController, RecordsController, ScansController, SubscriptionController } from "./controllers";
import { appConfig } from "./config";
import { DataStore } from "./data.store";
import { DatabaseService } from "./database/database.service";
import { MemoryStore } from "./memory.store";
import { MediaStorageService } from "./media-storage.service";
import { OpenAiIdentificationService } from "./openai-identification.service";
import { PostgresStore } from "./postgres.store";
import { RuleEngine } from "./rule.engine";

@Module({
  imports:[
    ConfigModule.forRoot({isGlobal:true,envFilePath:["../../.env",".env"]}),
    JwtModule.registerAsync({global:true,useFactory:()=>({secret:appConfig().jwtSecret,signOptions:{expiresIn:`${appConfig().accessTokenTtlMinutes}m`}})}),
    ThrottlerModule.forRoot([{name:"default",ttl:60_000,limit:120}]),
  ],
  controllers:[AuthController,HealthController,CountriesController,ScansController,RecordsController,SubscriptionController],
  providers:[
    DatabaseService,MemoryStore,PostgresStore,RuleEngine,MediaStorageService,OpenAiIdentificationService,
    {provide:DataStore,inject:[MemoryStore,PostgresStore],useFactory:(memory:MemoryStore,postgres:PostgresStore):DataStore=>appConfig().dataMode === "postgres" ? postgres : memory},
    {provide:APP_GUARD,useClass:ThrottlerGuard},
  ],
})
export class AppModule {}
