"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.worksRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const createWorkSchema = zod_1.z.object({
    wordCount: zod_1.z.number().int().positive(),
    priceInRs: zod_1.z.number().int().positive(),
    categoryType: zod_1.z.enum(['STUDENT', 'VENDOR', 'OTHER']),
    clientName: zod_1.z.string().min(1),
    clientPhone: zod_1.z.string().regex(/^[0-9]{7,15}$/),
    otherDescription: zod_1.z.string().optional(),
    deadline: zod_1.z.string().datetime(),
});
const updateWorkAdminSchema = zod_1.z.object({
    wordCount: zod_1.z.number().int().positive().optional(),
    priceInRs: zod_1.z.number().int().positive().optional(),
    categoryType: zod_1.z.enum(['STUDENT', 'VENDOR', 'OTHER']).optional(),
    clientName: zod_1.z.string().min(1).optional(),
    clientPhone: zod_1.z.string().regex(/^[0-9]{7,15}$/).optional(),
    otherDescription: zod_1.z.string().optional().nullable(),
    deadline: zod_1.z.string().datetime().optional(),
    status: zod_1.z.enum(['PENDING', 'DONE', 'HAS_QUERY', 'CANCELLED']).optional(),
    marketingPersonId: zod_1.z.number().int().optional(),
    marketingCancelReason: zod_1.z.string().min(1).optional().nullable(),
    writerQuery: zod_1.z.string().min(1).optional().nullable(),
});
const updateWorkWriterSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'DONE', 'HAS_QUERY']),
    writerQuery: zod_1.z.string().min(1).optional(),
});
router.get('/', async (req, res, next) => {
    try {
        const role = req.user.role;
        const userId = req.user.id;
        const status = req.query.status;
        const marketingPersonId = req.query.marketingPersonId
            ? parseInt(req.query.marketingPersonId, 10)
            : undefined;
        const from = req.query.from;
        const to = req.query.to;
        const where = {};
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
            if (from)
                where.createdAt.gte = new Date(from);
            if (to)
                where.createdAt.lte = new Date(to);
        }
        const works = await prisma_1.prisma.work.findMany({
            where,
            include: { marketingPerson: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(works);
    }
    catch (err) {
        next(err);
    }
});
router.post('/', (0, auth_1.requireRole)('MARKETING'), async (req, res, next) => {
    try {
        const parsed = createWorkSchema.parse(req.body);
        const deadlineDate = new Date(parsed.deadline);
        if (Number.isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
            return res.status(400).json({ message: 'Deadline must be a future date' });
        }
        const created = await prisma_1.prisma.work.create({
            data: {
                wordCount: parsed.wordCount,
                priceInRs: parsed.priceInRs,
                categoryType: parsed.categoryType,
                clientName: parsed.clientName,
                clientPhone: parsed.clientPhone,
                otherDescription: parsed.categoryType === 'OTHER' ? parsed.otherDescription || '' : null,
                deadline: deadlineDate,
                marketingPersonId: req.user.id,
                status: 'PENDING',
                workCode: '',
            },
        });
        const workCode = `WORK-${created.id}`;
        const updated = await prisma_1.prisma.work.update({
            where: { id: created.id },
            data: { workCode },
            include: { marketingPerson: true },
        });
        res.status(201).json(updated);
    }
    catch (err) {
        if (err instanceof Error && 'issues' in err) {
            return res.status(400).json({ message: 'Invalid input' });
        }
        next(err);
    }
});
router.put('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const role = req.user.role;
        if (role === 'ADMIN') {
            const parsed = updateWorkAdminSchema.parse(req.body);
            const data = { ...parsed };
            if (parsed.deadline) {
                const d = new Date(parsed.deadline);
                if (Number.isNaN(d.getTime()) || d <= new Date()) {
                    return res.status(400).json({ message: 'Deadline must be a future date' });
                }
                data.deadline = d;
            }
            const updated = await prisma_1.prisma.work.update({
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
            const updated = await prisma_1.prisma.work.update({
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
    }
    catch (err) {
        if (err instanceof Error && 'issues' in err) {
            return res.status(400).json({ message: 'Invalid input' });
        }
        next(err);
    }
});
router.delete('/:id', (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await prisma_1.prisma.work.delete({ where: { id } });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// Marketing can cancel a work with a required reason.
const cancelWorkSchema = zod_1.z.object({
    reason: zod_1.z.string().min(1),
});
router.post('/:id/cancel', (0, auth_1.requireRole)('MARKETING'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { reason } = cancelWorkSchema.parse(req.body);
        // Ensure this work belongs to the marketing user
        const work = await prisma_1.prisma.work.findUnique({ where: { id } });
        if (!work || work.marketingPersonId !== req.user.id) {
            return res.status(404).json({ message: 'Work not found' });
        }
        const updated = await prisma_1.prisma.work.update({
            where: { id },
            data: {
                status: 'CANCELLED',
                marketingCancelReason: reason,
            },
            include: { marketingPerson: true },
        });
        res.json(updated);
    }
    catch (err) {
        if (err instanceof Error && 'issues' in err) {
            return res.status(400).json({ message: 'Invalid input' });
        }
        next(err);
    }
});
exports.worksRouter = router;
