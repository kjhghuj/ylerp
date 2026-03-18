import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function importData() {
    try {
        console.log('Starting finance data import...');
        
        // 1. Read JSON file
        const dataPath = 'c:\\Users\\admin\\Desktop\\数据.json';
        console.log(`Reading data from: ${dataPath}`);
        const rawDataRaw = fs.readFileSync(dataPath, 'utf-8');
        const importedRawData = JSON.parse(rawDataRaw);
        
        // 2. Clear existing records
        console.log('Clearing existing finance records...');
        await prisma.financeRecord.deleteMany({});
        console.log('Cleared existing records.');

        const recordsToInsert: any[] = [];
        
        // 3. Parse data
        importedRawData.forEach((monthGroup: any) => {
            const monthMatch = monthGroup.month.match(/(\d{4})年(\d{1,2})月/);
            if (!monthMatch) return;
            const year = parseInt(monthMatch[1]);
            const month = parseInt(monthMatch[2]);

            monthGroup.days.forEach((day: any) => {
                const dayMatch = day.date.match(/(\d{1,2})日/);
                if (!dayMatch) return;
                const dayNum = parseInt(dayMatch[1]);

                // Create date object (Standardize to noon UTC to avoid timezone issues)
                const dateObj = new Date(Date.UTC(year, month - 1, dayNum, 12, 0, 0));
                const notes = day.notes || '';

                const addRecord = (amountStr: string, type: string, category: string, descPrefix: string) => {
                    if (!amountStr) return;
                    // handle string or number, strip commas if string
                    const amountRaw = typeof amountStr === 'string' ? amountStr.replace(/,/g, '') : amountStr;
                    const amount = parseFloat(amountRaw as string);
                    
                    if (amount > 0) {
                        recordsToInsert.push({
                            date: dateObj,
                            type,
                            amount,
                            category,
                            description: notes ? `${descPrefix} - ${notes}` : descPrefix,
                            accountId: 'main'
                        });
                    }
                };

                addRecord(day.expectedIncome, 'income', 'Revenue', 'Income');
                addRecord(day.newDebt, 'new_debt', 'Loans', 'New Loan');
                addRecord(day.repayment, 'debt_repayment', 'Debt Service', 'Repayment');
                addRecord(day.rentUtilities, 'expense', 'Operations', 'Rent/Utilities');
                addRecord(day.freightCost, 'expense', 'Logistics', 'Freight');
                addRecord(day.salary, 'expense', 'HR', 'Salary');
            });
        });

        console.log(`Parsed ${recordsToInsert.length} records. Inserting into database...`);
        
        // 4. Insert data
        const result = await prisma.financeRecord.createMany({
            data: recordsToInsert
        });
        
        console.log(`Successfully inserted ${result.count} records.`);
        
        // 5. Clear Redis Cache
        console.log('Clearing Redis cache...');
        await redis.del('finance');
        console.log('Redis cache cleared.');
        
        console.log('Import complete!');
    } catch (error) {
        console.error('Error during import:', error);
    } finally {
        await prisma.$disconnect();
        redis.disconnect();
    }
}

importData();
