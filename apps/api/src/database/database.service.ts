import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import type { QueryRunner } from "typeorm";
import { appConfig } from "../config";
import { createDataSource } from "./data-source";

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly dataSource = createDataSource();

  async onModuleInit(): Promise<void> {
    if (appConfig().dataMode === "postgres" && !this.dataSource.isInitialized) await this.dataSource.initialize();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }

  async query<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.dataSource.query(sql, params) as unknown;
    // TypeORM's Postgres driver returns UPDATE ... RETURNING as [rows, affectedCount]
    // while SELECT/INSERT return rows directly. Keep store callers driver-agnostic.
    if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === "number") return result[0] as T[];
    return result as T[];
  }

  async transaction<T>(work: (queryRunner: QueryRunner) => Promise<T>): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const result = await work(runner);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
