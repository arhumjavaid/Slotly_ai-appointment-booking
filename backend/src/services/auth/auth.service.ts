import type { User } from '@prisma/client';
import { ApiError, ErrorCode } from '../../utils/apiError';
import { hashPassword, verifyPassword } from '../../utils/security';
import { userRepository } from '../../repositories/user.repository';
import type { LoginInput, RegisterInput } from '../../schemas/auth.schema';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Strips the password hash before a user object can leave the service layer. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * A bcrypt hash of a throwaway value, compared against when no user matches.
 * Without it, a missing account returns noticeably faster than a wrong
 * password, which leaks which emails are registered.
 */
const DUMMY_HASH = '$2a$12$yHYjzEAPLlELCJYXM/ek0ey5kOHWRHOLbVebW4rqEH64msCrtn.sa';

export const authService = {
  async register(input: RegisterInput): Promise<PublicUser> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw ApiError.conflict(ErrorCode.EMAIL_TAKEN, 'An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
    });

    return toPublicUser(user);
  },

  async login(input: LoginInput): Promise<PublicUser> {
    const user = await userRepository.findByEmail(input.email);
    const matches = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

    // One generic error for both branches so the response cannot be used to
    // enumerate which email addresses have accounts.
    if (!user || !matches) throw ApiError.invalidCredentials();

    return toPublicUser(user);
  },

  async getById(id: string): Promise<PublicUser> {
    const user = await userRepository.findById(id);
    if (!user) throw ApiError.unauthorized('Session is no longer valid');
    return toPublicUser(user);
  },
};
