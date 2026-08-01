if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to apply the Vox schema.");
}

const { SCHEMA, sql } = await import("../src/lib/db/index.ts");
try {
  await sql.begin(async (tx) => {
    await tx.unsafe("set local statement_timeout = '5min'");
    await tx.unsafe("set local client_min_messages = 'warning'");
    await tx.unsafe(SCHEMA);
  });
  console.log("Vox database schema applied successfully.");
} finally {
  await sql.end();
}
