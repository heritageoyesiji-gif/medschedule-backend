import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../db/prisma";

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in your .env");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === "superadmin") {
      console.log(`Superadmin already exists: ${email}`);
    } else {
      await prisma.user.update({ where: { email }, data: { role: "superadmin" } });
      console.log(`Upgraded existing user to superadmin: ${email}`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      userId: `usr_${uuidv4().slice(0, 8)}`,
      firstName: "Super",
      lastName: "Admin",
      email,
      passwordHash,
      role: "superadmin",
      facilityId: "",
      status: "active",
      createdAt: new Date().toISOString(),
    },
  });

  console.log(`Superadmin created: ${email}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
