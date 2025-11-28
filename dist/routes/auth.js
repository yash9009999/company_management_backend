"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const auth_2 = require("../middleware/auth");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
router.post('/login', async (req, res, next) => {
    try {
        const parsed = loginSchema.parse(req.body);
        const user = await prisma_1.prisma.user.findUnique({ where: { email: parsed.email } });
        if (!user || !user.isActive) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const valid = await bcryptjs_1.default.compare(parsed.password, user.passwordHash);
        if (!valid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const token = (0, auth_1.signToken)({ id: user.id, role: user.role });
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    }
    catch (err) {
        if (err instanceof Error && 'issues' in err) {
            return res.status(400).json({ message: 'Invalid input' });
        }
        next(err);
    }
});
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});
router.get('/me', auth_2.requireAuth, async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter = router;
