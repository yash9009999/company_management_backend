import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireRole } from '../middleware/auth';

const router = Router();

const createWorkSchema = z.object({
  wordCount: z.number().int().positive(),
  priceInRs: z.number().int().positive(),
  categoryType: z.enum(['STUDENT', 'VENDOR', 'OTHER']),
  clientName: z.string().min(1),
  clientPhone: z.string().regex(/^[0-9]{7,15}$/),
  otherDescription: z.string().optional(),
  deadline: z.string().datetime(),
});

const updateWorkAdminSchema = z.object({
  wordCount: z.number().int().positive().optional(),
  priceInRs: z.number().int().positive().optional(),
  categoryType: z.enum(['STUDENT', 'VENDOR', 'OTHER']).optional(),
  clientName: z.string().min(1).optional(),
  clientPhone: z.string().regex(/^[0-9]{7,15}$/).optional(),
  otherDescription: z.string().optional().nullable(),
  deadline: z.string().datetime().optional(),
  status: z.enum(['PENDING', 'DONE', 'HAS_QUERY', 'CANCELLED']).optional(),
  marketingPersonId: z.number().int().optional(),
  marketingCancelReason: z.string().min(1).optional().nullable(),
  writerQuery: z.string().min(1).optional().nullable(),
});

const updateWorkWriterSchema = z.object({
  status: z.enum(['PENDING', 'DONE', 'HAS_QUERY']),
  writerQuery: z.string().min(1).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const role = req.user!.role;
    const userId = req.user!.id;

    const status = req.query.status as string | undefined;
    const marketingPersonId = req.query.marketingPersonId
      ? parseInt(req.query.marketingPersonId as string, 10)
      : undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const where: any = {};

    if (role === 'MARKETING') {
      where.marketingPersonId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (marketingPersonId && role === 'ADMIN') {
      where.marketingPersonId = marketingPersonId;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const works = await prisma.work.findMany({
      where,
      include: { marketingPerson: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(works);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('MARKETING'), async (req, res, next) => {
  try {
    const parsed = createWorkSchema.parse(req.body);

    const deadlineDate = new Date(parsed.deadline);
    if (Number.isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
      return res.status(400).json({ message: 'Deadline must be a future date' });
    }

    const created = await prisma.work.create({
      data: {
        wordCount: parsed.wordCount,
        priceInRs: parsed.priceInRs,
        categoryType: parsed.categoryType,
        clientName: parsed.clientName,
        clientPhone: parsed.clientPhone,
        otherDescription: parsed.categoryType === 'OTHER' ? parsed.otherDescription || '' : null,
        deadline: deadlineDate,
        marketingPersonId: req.user!.id,
        status: 'PENDING',
        workCode: '',
      },
    });

    const workCode = `WORK-${created.id}`;
    const updated = await prisma.work.update({
      where: { id: created.id },
      data: { workCode },
      include: { marketingPerson: true },
    });

    res.status(201).json(updated);
  } catch (err) {
    if (err instanceof Error && 'issues' in (err as any)) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const role = req.user!.role;

    if (role === 'ADMIN') {
      const parsed = updateWorkAdminSchema.parse(req.body);
      const data: any = { ...parsed };

      if (parsed.deadline) {
        const d = new Date(parsed.deadline);
        if (Number.isNaN(d.getTime()) || d <= new Date()) {
          return res.status(400).json({ message: 'Deadline must be a future date' });
        }
        data.deadline = d;
      }

      const updated = await prisma.work.update({
        where: { id },
        data,
        include: { marketingPerson: true },
      });
      return res.json(updated);
    }

    if (role === 'WRITER') {
      const parsed = updateWorkWriterSchema.parse(req.body);

      if (parsed.status === 'HAS_QUERY' && !parsed.writerQuery) {
        return res.status(400).json({ message: 'writerQuery is required when status is HAS_QUERY' });
      }

      const updated = await prisma.work.update({
        where: { id },
        data: {
          status: parsed.status,
          writerQuery: parsed.status === 'HAS_QUERY' ? parsed.writerQuery || '' : null,
        },
        include: { marketingPerson: true },
      });
      return res.json(updated);
    }

    return res.status(403).json({ message: 'Forbidden' });
  } catch (err) {
    if (err instanceof Error && 'issues' in (err as any)) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.work.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Marketing can cancel a work with a required reason.
const cancelWorkSchema = z.object({
  reason: z.string().min(1),
});

router.post('/:id/cancel', requireRole('MARKETING'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = cancelWorkSchema.parse(req.body);

    // Ensure this work belongs to the marketing user
    const work = await prisma.work.findUnique({ where: { id } });
    if (!work || work.marketingPersonId !== req.user!.id) {
      return res.status(404).json({ message: 'Work not found' });
    }

    const updated = await prisma.work.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        marketingCancelReason: reason,
      },
      include: { marketingPerson: true },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof Error && 'issues' in (err as any)) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    next(err);
  }
});

export const worksRouter = router;
