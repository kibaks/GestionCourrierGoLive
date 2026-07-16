/**
 * Exécute les migrations SQL (run-migrations.sql) via mysql2.
 * Utilise les variables MYSQL_* ou DB_* du .env.
 *
 * Exécution: npm run migrate:mysql
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const host = process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);
  const user = process.env.MYSQL_USER || process.env.DB_USERNAME || 'root';
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';

  console.log('Connexion MySQL...', { host, port, user });
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });

  const sqlPath = join(__dirname, '..', 'laravel-api', 'database', 'run-migrations.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  console.log('Exécution des migrations...');
  await conn.query(sql);
  await conn.end();
  console.log('Migrations terminées.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
