import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { AuthResponse, CountryCode, WasteCategory } from "@resort/contracts";
import * as argon2 from "argon2";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard";
import { appConfig } from "./config";
import { DataStore } from "./data.store";
import { CheckoutDto, DecisionDto, LoginDto, RegisterDto, WeightDto } from "./dto";
import { detectImageMime, MediaStorageService } from "./media-storage.service";
import { OpenAiIdentificationService } from "./openai-identification.service";
import { RuleEngine } from "./rule.engine";

const REFRESH_COOKIE="resort_refresh";
const tokenHash=(token:string):string=>createHash("sha256").update(token).digest("hex");
const refreshExpiry=():Date=>new Date(Date.now()+appConfig().refreshTokenTtlDays*86_400_000);
const publicUser=(user:Awaited<ReturnType<DataStore["getUser"]>>)=>({ id:user.id,username:user.username,displayName:user.displayName,countryCode:user.countryCode,timezone:user.timezone });

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(DataStore) private readonly store:DataStore,@Inject(JwtService) private readonly jwt:JwtService) {}

  private async issue(user:Awaited<ReturnType<DataStore["getUser"]>>,response:Response):Promise<AuthResponse> {
    const raw=randomBytes(48).toString("base64url"); const expiresAt=refreshExpiry();
    await this.store.createRefreshSession({ userId:user.id,tokenHash:tokenHash(raw),expiresAt });
    this.setCookie(response,raw,expiresAt);
    return { accessToken:await this.jwt.signAsync({sub:user.id,username:user.username}),user:publicUser(user) };
  }
  private setCookie(response:Response,token:string,expiresAt:Date):void { response.cookie(REFRESH_COOKIE,token,{ httpOnly:true,secure:appConfig().cookieSecure,sameSite:"lax",path:"/api/v1/auth",expires:expiresAt }); }
  private rawCookie(request:AuthenticatedRequest):string|undefined { return (request as AuthenticatedRequest & {cookies?:Record<string,string>}).cookies?.[REFRESH_COOKIE]; }

  @Post("login") async login(@Body() dto:LoginDto,@Res({passthrough:true}) response:Response):Promise<AuthResponse> {
    const user=await this.store.findUserByUsername(dto.username);
    if (!user || !(await argon2.verify(user.passwordHash,dto.password))) throw new UnauthorizedException("Invalid username or password");
    return this.issue(user,response);
  }
  @Post("register") async register(@Body() dto:RegisterDto,@Res({passthrough:true}) response:Response):Promise<AuthResponse> {
    const hash=await argon2.hash(dto.password,{ type:argon2.argon2id });
    return this.issue(await this.store.register(dto.username,hash),response);
  }
  @Post("refresh") async refresh(@Req() request:AuthenticatedRequest,@Res({passthrough:true}) response:Response):Promise<AuthResponse> {
    const raw=this.rawCookie(request); if (!raw) throw new UnauthorizedException("Refresh session is missing");
    const next=randomBytes(48).toString("base64url"); const expiresAt=refreshExpiry();
    try { const user=await this.store.rotateRefreshSession(tokenHash(raw),tokenHash(next),expiresAt); this.setCookie(response,next,expiresAt); return { accessToken:await this.jwt.signAsync({sub:user.id,username:user.username}),user:publicUser(user) }; }
    catch { response.clearCookie(REFRESH_COOKIE,{path:"/api/v1/auth"}); throw new UnauthorizedException("Refresh session is invalid or expired"); }
  }
  @Get("me") @UseGuards(AuthGuard) @ApiBearerAuth() async me(@Req() request:AuthenticatedRequest) { const user=await this.store.getUser(request.userId); return { ...publicUser(user),subscription:await this.store.subscription(user.id) }; }
  @Post("logout") @HttpCode(204) async logout(@Req() request:AuthenticatedRequest,@Res({passthrough:true}) response:Response):Promise<void> { const raw=this.rawCookie(request); if (raw) await this.store.revokeRefreshSession(tokenHash(raw)); response.clearCookie(REFRESH_COOKIE,{path:"/api/v1/auth"}); }
}

@ApiTags("operations") @Controller("health")
export class HealthController {
  constructor(@Inject(DataStore) private readonly store:DataStore) {}
  @Get("live") live(){return {status:"ok"};}
  @Get("ready") async ready(){const state=await this.store.readiness(); if(state.database!=="ok") throw new HttpException({status:"unavailable",...state},HttpStatus.SERVICE_UNAVAILABLE); return {status:"ok",dataMode:appConfig().dataMode,aiMode:appConfig().resolvedAiMode,...state};}
}

@ApiTags("countries") @Controller("countries") @UseGuards(AuthGuard) @ApiBearerAuth()
export class CountriesController { constructor(@Inject(DataStore) private readonly store:DataStore){} @Get() all(){return this.store.countries();} }

@ApiTags("scans") @Controller("scans") @UseGuards(AuthGuard) @ApiBearerAuth()
export class ScansController {
  constructor(@Inject(DataStore) private readonly store:DataStore,@Inject(RuleEngine) private readonly rules:RuleEngine,@Inject(OpenAiIdentificationService) private readonly vision:OpenAiIdentificationService,@Inject(MediaStorageService) private readonly media:MediaStorageService){}

  @Post() @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("image",{storage:memoryStorage(),limits:{fileSize:50*1024*1024,files:1}}))
  async create(@Req() request:AuthenticatedRequest,@UploadedFile() file:Express.Multer.File|undefined,@Headers("idempotency-key") key?:string,@Body("countryCode") countryValue?:string){
    const requestKey=key ?? randomUUID(); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) throw new BadRequestException("Idempotency-Key must be a UUID");
    const existing=await this.store.findScanByIdempotency(request.userId,requestKey); if(existing) return existing;
    if(!file) throw new BadRequestException("Multipart field 'image' is required");
    const config=appConfig(); if(file.size>config.maxUploadBytes) throw new BadRequestException(`Image must be no larger than ${Math.round(config.maxUploadBytes/1_048_576)} MB`);
    const detected=detectImageMime(file.buffer); if(!detected) throw new BadRequestException("Only genuine JPEG, PNG, WebP and HEIF images are supported");
    let metadata:sharp.Metadata; try{metadata=await sharp(file.buffer,{limitInputPixels:config.maxImagePixels}).metadata();}catch{throw new BadRequestException("Image is malformed or unsupported");}
    if(!metadata.width||!metadata.height||metadata.width*metadata.height>config.maxImagePixels) throw new BadRequestException("Image dimensions are invalid or too large");
    const countryCode=(countryValue ?? "DE") as CountryCode; if(countryCode!=="DE") throw new BadRequestException("This country is coming soon");
    const processed=await sharp(file.buffer,{limitInputPixels:config.maxImagePixels}).rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).jpeg({quality:85,mozjpeg:true}).toBuffer({resolveWithObject:true});
    const subscription=await this.store.subscription(request.userId); const settings=this.vision.settings(subscription.plan);
    const reservation=await this.store.beginScan(request.userId,requestKey,countryCode,settings.provider,settings.model,settings.promptVersion); if(reservation.existing) return reservation.scan;
    const storageKey=await this.media.put(request.userId,reservation.scan.id,processed.data);
    await this.store.saveMedia(request.userId,reservation.scan.id,{storageKey,mimeType:"image/jpeg",byteSize:processed.data.length,width:processed.info.width,height:processed.info.height,sha256:createHash("sha256").update(processed.data).digest("hex"),deleteAfter:new Date(Date.now()+config.imageRetentionDays*86_400_000)});
    const started=Date.now();
    try{const identification=await this.vision.identify(processed.data,subscription.plan);return await this.store.completeScan(request.userId,reservation.scan.id,identification,Date.now()-started);}
    catch(error){await this.store.failScan(request.userId,reservation.scan.id,(error as {response?:{code?:string}}).response?.code ?? "AI_IDENTIFICATION_FAILED");throw error;}
  }
  @Get(":id") get(@Req() request:AuthenticatedRequest,@Param("id") id:string){return this.store.getScan(request.userId,id);}
  @Get(":id/thumbnail") async thumbnail(@Req() request:AuthenticatedRequest,@Param("id") id:string,@Res() response:Response){const stored=await this.store.getMedia(request.userId,id);const image=await this.media.read(stored.storageKey);response.setHeader("Content-Type",stored.mimeType);response.setHeader("Cache-Control","private, max-age=300");response.send(image);}
  @Post(":id/decision") async decide(@Req() request:AuthenticatedRequest,@Param("id") id:string,@Body() dto:DecisionDto){
    if(dto.decision==="REJECT"){await this.store.rejectScan(request.userId,id,dto.reasonCode,dto.comment);return {scanId:id,status:"REJECTED",message:"Your feedback has been received"};}
    const scan=await this.store.getScan(request.userId,id); if(!scan.identification) throw new BadRequestException("Scan has no completed identification");
    const sorted=this.rules.resolve(scan.identification); const factor=await this.store.carbonFactor(sorted.category,sorted.disposalRoute);
    const subscription=await this.store.subscription(request.userId);
    const baseRecord=this.rules.buildRecord(id,scan.identification,sorted,factor);
    const enrichment=await this.vision.enrich(subscription.plan,scan.identification,sorted,baseRecord.estimatedWeightGrams,factor);
    const record=await this.store.acceptScan(request.userId,id,{...baseRecord,...enrichment});
    return {scanId:id,status:"ACCEPTED",wasteRecordId:record.id,record};
  }
}

@ApiTags("records") @Controller() @UseGuards(AuthGuard) @ApiBearerAuth()
export class RecordsController {
  constructor(@Inject(DataStore) private readonly store:DataStore,@Inject(MediaStorageService) private readonly media:MediaStorageService){}
  @Get("waste-records") list(@Req() request:AuthenticatedRequest,@Query("page") pageValue?:string,@Query("pageSize") sizeValue?:string,@Query("from") from?:string,@Query("to") to?:string,@Query("category") category?:WasteCategory,@Query("route") route?:string){const page=Math.max(1,Number(pageValue)||1);const pageSize=Math.min(100,Math.max(1,Number(sizeValue)||20));return this.store.listRecords(request.userId,{page,pageSize,from,to,category,route});}
  @Get("waste-records/:id") get(@Req() request:AuthenticatedRequest,@Param("id") id:string){return this.store.getRecord(request.userId,id);}
  @Patch("waste-records/:id/weight") weight(@Req() request:AuthenticatedRequest,@Param("id") id:string,@Body() dto:WeightDto){return this.store.updateWeight(request.userId,id,dto.grams);}
  @Delete("waste-records/:id") @HttpCode(204) async remove(@Req() request:AuthenticatedRequest,@Param("id") id:string):Promise<void>{const key=await this.store.deleteRecord(request.userId,id);if(key) await this.media.delete(key);}
  @Get("analytics/summary") summary(@Req() request:AuthenticatedRequest,@Query("from") from?:string,@Query("to") to?:string){return this.store.analytics(request.userId,from,to);}
}

@ApiTags("subscriptions") @Controller("subscriptions") @UseGuards(AuthGuard) @ApiBearerAuth()
export class SubscriptionController {
  constructor(@Inject(DataStore) private readonly store:DataStore){}
  @Get("plans") plans(){return this.store.plans();}
  @Get("current") current(@Req() request:AuthenticatedRequest){return this.store.subscription(request.userId);}
  @Get("transactions") history(@Req() request:AuthenticatedRequest){return this.store.transactions(request.userId);}
  @Post("fake-checkout") checkout(@Req() request:AuthenticatedRequest,@Body() dto:CheckoutDto){return this.store.checkout(request.userId,dto.planCode,dto.paymentMethodToken);}
  @Post("switch-to-free") free(@Req() request:AuthenticatedRequest){return this.store.switchToFree(request.userId);}
}
