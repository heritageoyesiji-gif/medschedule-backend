import { prisma } from "./prisma";

export async function createMagicLinkToken(userId: string, token: string, expiresAt: string): Promise<void> {
  await prisma.magicLinkToken.create({ data: { token, userId, expiresAt, used: false } });
}

export async function consumeMagicLinkToken(token: string): Promise<string | null> {
  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row || row.used || new Date(row.expiresAt) < new Date()) return null;
  await prisma.magicLinkToken.update({ where: { token }, data: { used: true } });
  return row.userId;
}

export async function createQrLoginToken(userId: string, token: string, expiresAt: string): Promise<void> {
  await prisma.qrLoginToken.create({ data: { token, userId, expiresAt, used: false } });
}

export async function consumeQrLoginToken(token: string): Promise<string | null> {
  const row = await prisma.qrLoginToken.findUnique({ where: { token } });
  if (!row || row.used || new Date(row.expiresAt) < new Date()) return null;
  await prisma.qrLoginToken.update({ where: { token }, data: { used: true } });
  return row.userId;
}

export async function createPasswordResetToken(userId: string, token: string, expiresAt: string): Promise<void> {
  await prisma.passwordResetToken.create({ data: { token, userId, expiresAt, used: false } });
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row || row.used || new Date(row.expiresAt) < new Date()) return null;
  await prisma.passwordResetToken.update({ where: { token }, data: { used: true } });
  return row.userId;
}

export async function createStaffInvite(token: string, facilityId: string, email: string, expiresAt: string): Promise<void> {
  await prisma.staffInvite.create({ data: { token, facilityId, email, expiresAt, used: false } });
}

export async function lookupStaffInvite(token: string): Promise<{ facilityId: string; email: string } | null> {
  const row = await prisma.staffInvite.findUnique({ where: { token } });
  if (!row || row.used || new Date(row.expiresAt) < new Date()) return null;
  return { facilityId: row.facilityId, email: row.email };
}

export async function consumeStaffInvite(token: string): Promise<{ facilityId: string; email: string } | null> {
  const row = await prisma.staffInvite.findUnique({ where: { token } });
  if (!row || row.used || new Date(row.expiresAt) < new Date()) return null;
  await prisma.staffInvite.update({ where: { token }, data: { used: true } });
  return { facilityId: row.facilityId, email: row.email };
}

export async function purgeExpiredTokens(): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all([
    prisma.magicLinkToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.qrLoginToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.staffInvite.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
}
