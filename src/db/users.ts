import { prisma } from "./prisma";
import type { User, UserRole } from "../types";
import type { UserRecord } from "./store";

export function rowToUser(row: UserRecord): User {
  return {
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    role: row.role,
    facilityId: row.facilityId,
  };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  return row as UserRecord | null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const row = await prisma.user.findUnique({ where: { userId } });
  return row as UserRecord | null;
}

export async function setUserFacilityId(userId: string, facilityId: string): Promise<void> {
  await prisma.user.update({ where: { userId }, data: { facilityId } });
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({ where: { userId }, data: { passwordHash } });
}

export async function createUser(input: {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  facilityId: string;
}): Promise<UserRecord> {
  const row = await prisma.user.create({
    data: {
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      facilityId: input.facilityId,
      status: "active",
      createdAt: new Date().toISOString(),
    },
  });
  return row as UserRecord;
}
