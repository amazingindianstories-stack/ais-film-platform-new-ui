import { PrismaClient } from '@prisma/client/index.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = 'postgresql://postgres:postgres@localhost:5432/ais_film?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function run() {
  const hashedPassword = await bcrypt.hash("DemoPass2026!", 10);
  
  const user = await prisma.user.update({
    where: { email: 'client@aisstudio.com' },
    data: { password: hashedPassword }
  });
  
  console.log("Updated user password for", user.email);
}

run().finally(() => prisma.$disconnect());
