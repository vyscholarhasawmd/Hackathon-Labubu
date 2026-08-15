import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({
    origin: process.env.NODE_ENV === "production" ? (process.env.WEB_ORIGIN ?? "http://localhost:5173") : true,
    credentials: true,
  });
  const swagger = new DocumentBuilder().setTitle("Re-Sort API").setDescription("Local waste intelligence API").setVersion("1.0").addBearerAuth().build();
  SwaggerModule.setup("api/v1/docs", app, SwaggerModule.createDocument(app, swagger));
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  process.stdout.write(`Re-Sort API ready at http://localhost:${port}/api/v1\n`);
}

void bootstrap();
