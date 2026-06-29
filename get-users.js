import { PrismaClient } from '@prisma/client/index.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = 'postgresql://postgres:postgres@localhost:5432/ais_film?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

prisma.$connect()
  .then(async () => {
    const users = await prisma.user.findMany();
    console.log(users);
  })
  .catch(console.error)
  .finally(() => prisma.$disconnect());
