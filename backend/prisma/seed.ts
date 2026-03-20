import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    // Check if owner already exists
    const existingOwner = await prisma.user.findFirst({ where: { role: 'owner' } });

    if (existingOwner) {
        console.log('Owner account already exists, skipping seed.');
        return;
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);

    const owner = await prisma.user.create({
        data: {
            username: 'admin',
            password: hashedPassword,
            displayName: '管理员',
            role: 'owner',
            isActive: true,
        },
    });

    console.log(`Created owner account: ${owner.username} (ID: ${owner.id})`);
    console.log('Default password: admin123 — Please change it immediately!');
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
