import type { Prisma, User } from '@prisma/client';
import { prisma } from '../db/prisma';

export const userRepository = {
  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  },

  update(id: string, data: Prisma.UserUncheckedUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  },

  /**
   * Appointments, chat sessions and messages are all `onDelete: Cascade` from
   * the user, so removing the row removes the account's data with it. AI
   * interaction rows are deliberately kept — they carry no message content and
   * their user reference is nullable.
   */
  async deleteById(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  },
};
