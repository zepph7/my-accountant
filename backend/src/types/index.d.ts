/**
 * Ambient type augmentation.
 *
 * `authenticate` attaches the verified JWT subject to the request, and every
 * downstream controller reads `req.user.id` to scope its queries. Declaring it
 * here means a controller that forgets authentication fails to compile rather
 * than reading `undefined` and silently querying across all tenants.
 */

import type { UserRole } from './models';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: UserRole;
      timezone: string;
    }

    interface Request {
      user?: AuthenticatedUser;
      /** Correlation id assigned by the request logger. */
      id?: string;
    }
  }
}
