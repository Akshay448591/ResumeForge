import type { Request, Response, NextFunction, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const COOKIE = 'rf_token';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  maxAge: WEEK_MS,
};

export function setAuthCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, cookieOptions);
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE] as string | undefined;
  if (!token) return next(new AppError(401, 'Please sign in to continue.'));
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    req.userId = String(payload.sub);
    next();
  } catch {
    next(new AppError(401, 'Your session has expired. Please sign in again.'));
  }
}
