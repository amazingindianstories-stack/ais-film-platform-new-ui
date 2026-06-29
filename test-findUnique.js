import { PrismaClient } from '@prisma/client/index.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = 'postgresql://postgres:postgres@localhost:5432/ais_film?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function run() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'client@aisstudio.com' }
    });
    console.log("Success! Found user:", user);
  } catch (err) {
    console.error("Prisma error:", err);
  }
}

run().finally(() => prisma.$disconnect());
