import "reflect-metadata";
import { DataSource } from "typeorm";
import { appConfig } from "../config";
import { Initial1723680000000 } from "./migrations/1723680000000-Initial";

export function createDataSource(): DataSource {
  const config = appConfig();
  return new DataSource({
    type: "postgres",
    url: config.databaseUrl,
    synchronize: false,
    migrationsRun: false,
    logging: false,
    entities: [],
    migrations: [Initial1723680000000],
  });
}
