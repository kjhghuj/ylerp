import { handleJsonRouteErrors } from '../utils/routeHandler';
import { withUsageEvent } from '../services/usageEvents';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../infrastructure/runtimeResources';
import { z } from 'zod';

const mapValidationError = (error: unknown) => error instanceof z.ZodError
  ? { status: 400, body: { error: 'Validation failed', details: error.issues } }
  : undefined;

const router = Router();

const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
  country: z.string().optional().nullable(),
  platform: z.string().optional().nullable(),
  type: z.string().optional(),
  productId: z.string().optional().nullable(),
});

const updateSchema = templateSchema.partial();

const castJson = (value: unknown[]): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

router.get('/', handleJsonRouteErrors(async (req, res) => {
  const userId = req.user!.id;
  const { type, country, platform } = req.query;
  const templates = await prisma.nodeGraphTemplate.findMany({
    where: {
      userId,
      ...(type ? { type: String(type) } : {}),
      ...(country ? { country: String(country) } : {}),
      ...(platform ? { platform: String(platform) } : {}),
    },
    select: { id: true, name: true, country: true, platform: true, type: true, createdAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(templates);
}, 'Failed to fetch templates'));

router.get('/:id', handleJsonRouteErrors(async (req, res) => {
  const userId = req.user!.id;
  const template = await prisma.nodeGraphTemplate.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
}, 'Failed to fetch template'));

router.post('/', handleJsonRouteErrors(async (req, res) => {
  const userId = req.user!.id;
  const parsed = templateSchema.parse(req.body);
  const template = await withUsageEvent(prisma, req, { module: 'template', action: 'node_template_create', objectType: 'NodeGraphTemplate' }, tx => tx.nodeGraphTemplate.create({
    data: {
      name: parsed.name,
      type: parsed.type || 'profit',
      country: parsed.country ?? undefined,
      platform: parsed.platform ?? undefined,
      nodes: castJson(parsed.nodes),
      edges: castJson(parsed.edges),
      productId: parsed.productId ?? undefined,
      userId,
    },
  }));
  res.status(201).json(template);
}, 'Failed to create template', { mapError: mapValidationError }));

router.put('/:id', handleJsonRouteErrors(async (req, res) => {
  const userId = req.user!.id;
  const parsed = updateSchema.parse(req.body);

  const existing = await prisma.nodeGraphTemplate.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const data: Record<string, unknown> = {};
  if (parsed.name !== undefined) data.name = parsed.name;
  if (parsed.type !== undefined) data.type = parsed.type;
  if (parsed.country !== undefined) data.country = parsed.country;
  if (parsed.platform !== undefined) data.platform = parsed.platform;
  if (parsed.nodes !== undefined) data.nodes = castJson(parsed.nodes);
  if (parsed.edges !== undefined) data.edges = castJson(parsed.edges);
  if (parsed.productId !== undefined) data.productId = parsed.productId;

  const template = await withUsageEvent(prisma, req, { module: 'template', action: 'node_template_update', objectType: 'NodeGraphTemplate' }, tx => tx.nodeGraphTemplate.update({
    where: { id: req.params.id },
    data,
  }));
  res.json(template);
}, 'Failed to update template', { mapError: mapValidationError }));

router.delete('/:id', handleJsonRouteErrors(async (req, res) => {
  const userId = req.user!.id;

  const existing = await prisma.nodeGraphTemplate.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  await withUsageEvent(prisma, req, { module: 'template', action: 'node_template_delete', objectType: 'NodeGraphTemplate' }, tx => tx.nodeGraphTemplate.delete({ where: { id: req.params.id } }));
  res.status(204).send();
}, 'Failed to delete template'));

export default router;
