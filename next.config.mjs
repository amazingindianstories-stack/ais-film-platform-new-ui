import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root,
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
