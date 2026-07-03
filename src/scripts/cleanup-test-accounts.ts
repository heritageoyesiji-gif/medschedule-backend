import { prisma } from "../db/prisma";

// One-off cleanup for the throwaway admin accounts + facilities created while
// debugging the unpublish/deploy issue. Deliberately narrow: only users whose
// email ends in "@example.com" AND starts with "debug" or "verify" — the exact
// patterns used by the diagnostics. Real accounts can never match.
//
// Run against production:
//   $env:DATABASE_URL="<DATABASE_PUBLIC_URL>"; npx tsx src/scripts/cleanup-test-accounts.ts

const MAX_EXPECTED = 25; // safety valve: abort if the match set is suspiciously large

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: { endsWith: "@example.com" },
      OR: [{ email: { startsWith: "debug" } }, { email: { startsWith: "verify" } }],
    },
    select: { userId: true, email: true },
  });

  if (users.length === 0) {
    console.log("No test accounts found. Nothing to clean up.");
    return;
  }

  const userIds = users.map((u) => u.userId);
  const facilities = await prisma.facility.findMany({
    where: { adminUserId: { in: userIds } },
    select: { facilityId: true, name: true },
  });
  const facilityIds = facilities.map((f) => f.facilityId);

  console.log(`Found ${users.length} test user(s):`);
  users.forEach((u) => console.log(`  - ${u.email} (${u.userId})`));
  console.log(`Found ${facilities.length} facility(ies):`);
  facilities.forEach((f) => console.log(`  - ${f.name} (${f.facilityId})`));

  if (users.length > MAX_EXPECTED || facilities.length > MAX_EXPECTED) {
    console.error(
      `\nAborting: match set larger than expected (>${MAX_EXPECTED}). ` +
        "Refusing to delete in case the filter is too broad.",
    );
    process.exitCode = 1;
    return;
  }

  const result = await prisma.$transaction([
    prisma.shift.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.publishedSchedule.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.aIPreview.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.swapRequest.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.timeOffRequest.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.staffInvite.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.facilityShiftConfig.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.facilityOvertimeConfig.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.staffingRequirement.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.staffProfile.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.notification.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.facility.deleteMany({ where: { facilityId: { in: facilityIds } } }),
    prisma.user.deleteMany({ where: { userId: { in: userIds } } }),
  ]);

  const [shifts, published, previews, swaps, timeOff, invites, shiftCfg, otCfg, reqs, staff, notifs, facs, usrs] =
    result.map((r) => r.count);

  console.log("\nDeleted:");
  console.log(`  users: ${usrs}, facilities: ${facs}`);
  console.log(
    `  shifts: ${shifts}, publishedSchedules: ${published}, aiPreviews: ${previews}, ` +
      `swaps: ${swaps}, timeOff: ${timeOff}, invites: ${invites}, shiftConfigs: ${shiftCfg}, ` +
      `otConfigs: ${otCfg}, requirements: ${reqs}, staffProfiles: ${staff}, notifications: ${notifs}`,
  );
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
