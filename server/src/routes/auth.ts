import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { AppError, wrap } from '../lib/errors.js';
import { clearAuthCookie, requireAuth, setAuthCookie } from '../middleware/auth.js';

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z.string().min(8, 'Use at least 8 characters').max(128);
const name = z.string().trim().min(1, 'Enter your name').max(100);

const publicUser = (u: { _id: unknown; name: string; email: string }) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
});

authRouter.post(
  '/register',
  limiter,
  wrap(async (req, res) => {
    const body = z.object({ name, email, password }).parse(req.body);
    if (await User.exists({ email: body.email })) {
      throw new AppError(409, 'An account with this email already exists.', {
        email: ['An account with this email already exists'],
      });
    }
    const user = await User.create({
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
    });
    setAuthCookie(res, String(user._id));
    res.status(201).json(publicUser(user));
  }),
);

authRouter.post(
  '/login',
  limiter,
  wrap(async (req, res) => {
    const body = z.object({ email, password: z.string().min(1) }).parse(req.body);
    const user = await User.findOne({ email: body.email });
    const ok = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
    if (!user || !ok) throw new AppError(401, 'Email or password is incorrect.');
    setAuthCookie(res, String(user._id));
    res.json(publicUser(user));
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new AppError(401, 'Please sign in to continue.');
    res.json(publicUser(user));
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const body = z.object({ name }).parse(req.body);
    const user = await User.findByIdAndUpdate(req.userId, { name: body.name }, { new: true });
    if (!user) throw new AppError(401, 'Please sign in to continue.');
    res.json(publicUser(user));
  }),
);

authRouter.post(
  '/me/password',
  requireAuth,
  wrap(async (req, res) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: password })
      .parse(req.body);
    const user = await User.findById(req.userId);
    if (!user) throw new AppError(401, 'Please sign in to continue.');
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new AppError(400, 'Current password is incorrect.', {
        currentPassword: ['Current password is incorrect'],
      });
    }
    user.passwordHash = await bcrypt.hash(body.newPassword, 12);
    await user.save();
    res.status(204).end();
  }),
);
