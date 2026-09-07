import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getUsageReport } from '../usageReport';
import { getUsageDetails } from '../usageDetails';
import { parseUsageFilter } from '../usagePolicy';

const url = process.env.USAGE_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration('usage report real PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url || 'postgresql://unused/usage_test' } } });
  const userId = `usage-report-${randomUUID()}`;
  const time = new Date('2026-09-04T16:30:00Z');
  beforeAll(async () => {
    if (!new URL(url!).pathname.includes('test')) throw new Error('Requires an isolated test database');
    await db.user.create({ data: { id:userId, username:userId, displayName:'统计测试', password:'unused' } });
    await db.usageEvent.createMany({ data: [
      {actorId:userId,actorName:'统计测试',module:'finance',action:'finance_import',eventKey:randomUUID(),affectedCount:200,occurredAt:time},
      {actorId:userId,module:'finance',action:'sync',source:'system',eventKey:randomUUID(),affectedCount:800,occurredAt:time},
      {actorId:userId,module:'auth',action:'login',eventKey:randomUUID(),occurredAt:new Date('2025-01-01Z')},
    ] });
    await db.aiUsageCall.createMany({ data: [
      {userId,requestKey:'generation',requestHash:'test',operationId:'batch',kind:'generation',mode:'test',model:'test',status:'success',outputCount:2,estimatedCost:'0.100001',startedAt:time},
      {userId,requestKey:'analysis',requestHash:'test',operationId:'batch',kind:'analysis',mode:'test',model:'test',status:'success',estimatedCost:'0.200002',startedAt:time},
      {userId,requestKey:'unknown',requestHash:'test',operationId:'batch',kind:'generation',mode:'test',model:'test',status:'unknown',startedAt:time},
      {userId,requestKey:'unpriced',requestHash:'test',operationId:'batch',kind:'generation',mode:'test',model:'unpriced',status:'success',outputCount:1,startedAt:time},
    ] });
    await db.chromaImage.create({data:{userId,filename:'test',size:1,mode:'test',model:'test',createdAt:time}});
    await db.userActivity.create({data:{userId,action:'image_generate',module:'chroma',createdAt:time}});
    await db.chromaGenerationRecord.create({data:{userId,mode:'test',model:'test',cost:-123,status:'error',createdAt:time}});
  });
  afterAll(async () => {
    await db.usageEvent.deleteMany({where:{actorId:userId}}); await db.aiUsageCall.deleteMany({where:{userId}});
    await db.chromaImage.deleteMany({where:{userId}}); await db.userActivity.deleteMany({where:{userId}});
    await db.chromaGenerationRecord.deleteMany({where:{userId}}); await db.user.deleteMany({where:{id:userId}}); await db.$disconnect();
  });
  const filter = () => parseUsageFilter({userId,days:'2'},new Date('2026-09-05T03:00:00Z'));
  it('runs actual SQL: Shanghai boundaries, zero days, Decimal totals and legacy separation', async () => {
    const r = await getUsageReport(db,filter());
    expect(r.summary).toMatchObject({operationCount:1,affectedCount:200,generationCount:2,imageCount:3,analysisCount:1,estimatedCost:'0.300003',currentGalleryCount:1,unknownCount:1,unpricedCount:1,activeUsers:1});
    expect(r.timeline[0].imageCount).toBe(0); expect(r.timeline[1].date).toBe('2026-09-05');
    expect(r.users[0].lastLogin).toBe('2025-01-01T00:00:00.000Z');
    expect(r.quality).toMatchObject({legacyEventCount:1,legacyGenerationCount:1,legacyEstimatedCost:'-123.000000'});
    expect(r.summary.generationCount).toBe(r.users.reduce((n,u)=>n+u.generationCount,0));
  });
  it('filters in SQL and paginates details independently from full aggregate', async () => {
    const f = {...filter(),module:'chroma',status:'success'};
    const r = await getUsageReport(db,f);
    expect(r.summary.operationCount).toBe(0); expect(r.summary.generationCount).toBe(2);
    const d = await getUsageDetails(db,f,{page:1,pageSize:1,kind:'ai'});
    expect(d.total).toBe(3); expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({status:'success',module:'chroma'});
    const legacy = await getUsageDetails(db,{...filter(),status:'failed'},{page:1,pageSize:10,kind:'legacy'});
    expect(legacy.total).toBe(1); expect(legacy.items[0].status).toBe('failed');
  });
  it('retains historical image production after gallery deletion', async () => {
    await db.chromaImage.deleteMany({where:{userId}});
    const r = await getUsageReport(db,filter());
    expect(r.summary.imageCount).toBe(3); expect(r.summary.currentGalleryCount).toBe(0);
  });
  it('filters current replenishment operations under restock-v2', async () => {
    const eventKey = randomUUID();
    await db.usageEvent.create({ data: { actorId: userId, module: 'restock-v2', action: 'restock_rule_save', eventKey, occurredAt: time } });
    try {
      const report = await getUsageReport(db, { ...filter(), module: 'restock-v2' });
      expect(report.summary.operationCount).toBe(1);
      expect(report.modules).toEqual([expect.objectContaining({ module: 'restock-v2', operationCount: 1 })]);
    } finally {
      await db.usageEvent.delete({ where: { eventKey } });
    }
  });
});
