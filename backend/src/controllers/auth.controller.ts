import type { Request, Response } from 'express';
import { authService } from '../services/auth/auth.service';
import { currentUser } from '../middleware/auth';
import { clearAuthCookie, setAuthCookie, signAuthToken } from '../utils/security';
import { sendSuccess } from '../utils/http';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema';

/**
 * Controllers stay thin: read validated input, delegate, shape the response.
 * The token is only ever written to an HttpOnly cookie — it is never included
 * in the JSON body, so it cannot be read by client-side JavaScript.
 */
export const authController = {
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body as RegisterInput);
    setAuthCookie(res, signAuthToken({ sub: user.id, email: user.email }));
    return sendSuccess(res, { user }, 201);
  },

  async login(req: Request, res: Response) {
    const user = await authService.login(req.body as LoginInput);
    setAuthCookie(res, signAuthToken({ sub: user.id, email: user.email }));
    return sendSuccess(res, { user });
  },

  async me(req: Request, res: Response) {
    const user = await authService.getById(currentUser(req).id);
    return sendSuccess(res, { user });
  },

  async logout(_req: Request, res: Response) {
    clearAuthCookie(res);
    return sendSuccess(res, { loggedOut: true });
  },
};
