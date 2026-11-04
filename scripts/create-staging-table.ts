import mariadb from 'mariadb';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL || '';
  const url = new URL(connectionString.replace('mysql://', 'http://'));
  const useSsl = url.hostname.includes('azure') || url.searchParams.get('ssl') === 'true' || url.searchParams.get('sslaccept') === 'strict';

  const pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 3
  });

  const conn = await pool.getConnection();
  console.log('✅ Conectado ao Azure MySQL!');

  const sql = `
    CREATE TABLE IF NOT EXISTS dominiostagingchange (
      id VARCHAR(36) PRIMARY KEY,
      companyId VARCHAR(36) NULL,
      companyCode VARCHAR(50) NULL,
      companyName VARCHAR(255) NOT NULL,
      sector VARCHAR(50) NOT NULL,
      referencePeriod VARCHAR(50) NOT NULL,
      columnKey VARCHAR(100) NOT NULL,
      columnLabel VARCHAR(150) NOT NULL,
      currentValue TEXT NULL,
      proposedValue TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      sourceFile VARCHAR(255) NULL,
      approvedBy VARCHAR(255) NULL,
      approvedAt DATETIME(3) NULL,
      rejectedAt DATETIME(3) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_status_sector (status, sector),
      INDEX idx_code_period (companyCode, referencePeriod)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await conn.query(sql);
  console.log('✅ Tabela dominiostagingchange criada com sucesso!');

  conn.release();
  await pool.end();
}

main().catch(console.error);

