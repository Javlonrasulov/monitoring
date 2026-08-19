import { PrismaClient, UserRole } from '../src/generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@monitor.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const orgName = process.env.SEED_ORG_NAME ?? 'Demo Bogcha';
  const branchName = process.env.SEED_BRANCH_NAME ?? 'Asosiy filial';

  const org = await prisma.organization.upsert({
    where: { id: 'seed-org' },
    update: { name: orgName },
    create: { id: 'seed-org', name: orgName },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch' },
    update: { name: branchName, organizationId: org.id },
    create: {
      id: 'seed-branch',
      name: branchName,
      organizationId: org.id,
    },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email,
      },
    },
    update: {
      passwordHash,
      name: 'Admin',
      role: UserRole.ADMIN,
    },
    create: {
      email,
      passwordHash,
      name: 'Admin',
      role: UserRole.ADMIN,
      organizationId: org.id,
    },
  });

  await prisma.subscription.create({
    data: {
      organizationId: org.id,
      status: 'ACTIVE',
      maxDevices: 2,
      startedAt: new Date(),
      expiresAt: new Date('2026-09-19T23:59:59.000Z'),
    },
  }).catch(async () => {
    const existing = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
    if (!existing) {
      throw new Error('Failed to seed subscription');
    }
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete');
  // eslint-disable-next-line no-console
  console.log({ orgId: org.id, branchId: branch.id, email, password });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
