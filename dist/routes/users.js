"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const userCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(['ADMIN', 'MARKETING', 'WRITER']),
});
const userUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    role: zod_1.z.enum(['ADMIN', 'MARKETING', 'WRITER']).optional(),
    isActive: zod_1.z.boolean().optional(),
    password: zod_1.z.string().min(6).optional(),
});
router.use((0, auth_1.requireRole)('ADMIN'));
router.get('/', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const pageSize = parseInt(req.query.pageSize || '20', 10);
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.user.count(),
        ]);
        res.json({ users, total, page, pageSize });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const parsed = userCreateSchema.parse(req.body);
        const passwordHash = await bcryptjs_1.default.hash(parsed.password, 10);
        const user = await prisma_1.prisma.user.create({
            data: {
                name: parsed.name,
                email: parsed.email,
                role: parsed.role,
                passwordHash,
            },
        });
        res.status(201).json(user);
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
        const parsed = userUpdateSchema.parse(req.body);
        const data = { ...parsed };
        if (parsed.password) {
            data.passwordHash = await bcryptjs_1.default.hash(parsed.password, 10);
            delete data.password;
        }
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data,
        });
        res.json(user);
    }
    catch (err) {
        if (err instanceof Error && 'issues' in err) {
            return res.status(400).json({ message: 'Invalid input' });
        }
        next(err);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data: { isActive: false },
        });
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
exports.usersRouter = router;
