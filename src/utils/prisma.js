import { PrismaClient } from '@prisma/client/index.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

const globalForPrisma = globalThis;

let prisma;

if (!globalForPrisma.prisma) {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
  }
} else {
  prisma = globalForPrisma.prisma;
}

export { prisma };
