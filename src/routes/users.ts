import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireRole } from '../middleware/auth';

const router = Router();

const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'MARKETING', 'WRITER']),
});

const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'MARKETING', 'WRITER']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.use(requireRole('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);

    res.json({ users, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = userCreateSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(parsed.password, 10);

    const user = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        role: parsed.role,
        passwordHash,
      },
    });

    res.status(201).json(user);
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
    const parsed = userUpdateSchema.parse(req.body);

    const data: any = { ...parsed };
    if (parsed.password) {
      data.passwordHash = await bcrypt.hash(parsed.password, 10);
      delete data.password;
    }

    const user = await prisma.user.update({
      where: { id },
      data,
    });

    res.json(user);
  } catch (err) {
    if (err instanceof Error && 'issues' in (err as any)) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

export const usersRouter = router;
