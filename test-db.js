import { PrismaClient } from '@prisma/client/index.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = 'postgresql://postgres:postgres@localhost:5432/ais_film?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function run() {
  const users = await prisma.user.findMany();
  console.log("Users:", users);
  const projects = await prisma.project.findMany();
  console.log("Projects:", projects);
}

run().finally(() => prisma.$disconnect());
