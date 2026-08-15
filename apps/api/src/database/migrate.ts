import { createDataSource } from "./data-source";

async function migrate(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  const migrations = await dataSource.runMigrations({ transaction: "all" });
  await dataSource.destroy();
  process.stdout.write(`PostgreSQL migrations ready (${migrations.length} applied).\n`);
}

void migrate().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Migration failed"}\n`);
  process.exitCode = 1;
});
