import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { ApiExceptionFilter } from "./api-exception.filter";
import { AppModule } from "./app.module";
import { appConfig } from "./config";

async function bootstrap():Promise<void>{
  const config=appConfig(); const app=await NestFactory.create(AppModule,{cors:false});
  app.enableShutdownHooks(); app.setGlobalPrefix("api/v1"); app.use(helmet()); app.use(cookieParser());
  app.use((request:Request & {requestId?:string},response:Response,next:NextFunction)=>{const incoming=request.header("x-request-id");request.requestId=incoming && /^[a-zA-Z0-9._-]{1,80}$/.test(incoming) ? incoming : randomUUID();response.setHeader("x-request-id",request.requestId);next();});
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.enableCors({origin:config.webOrigin.split(",").map((origin)=>origin.trim()),credentials:true,methods:["GET","POST","PATCH","DELETE","OPTIONS"]});
  if(config.nodeEnv!=="production"){
    const swagger=new DocumentBuilder().setTitle("Re-Sort API").setDescription("Waste identification, deterministic Germany sorting and impact API").setVersion("2.0").addBearerAuth().build();
    SwaggerModule.setup("api/v1/docs",app,SwaggerModule.createDocument(app,swagger));
  }
  await app.listen(config.port,"0.0.0.0"); process.stdout.write(`Re-Sort API ready at http://localhost:${config.port}/api/v1\n`);
}
void bootstrap();
