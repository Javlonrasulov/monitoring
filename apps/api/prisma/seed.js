"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/generated/prisma");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new prisma_1.PrismaClient();
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
            role: prisma_1.UserRole.ADMIN,
        },
        create: {
            email,
            passwordHash,
            name: 'Admin',
            role: prisma_1.UserRole.ADMIN,
            organizationId: org.id,
        },
    });
    console.log('Seed complete');
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
//# sourceMappingURL=seed.js.map