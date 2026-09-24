// Marks an account as admin (custom claim `admin: true`): the app then shows it the admin panel
// and editing tools, and the security rules let it change puzzles. Run once per account.
//
//   npm run admin:grant -- <email> [--revoke]
//
// The account must have signed in to the app at least once. The change reaches the app on the
// next sign-in (or within the hour, when the sign-in token refreshes).
import { initAdmin } from "./firebaseAdmin.ts";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) throw new Error("Usage: npm run admin:grant -- <email> [--revoke]");
  const revoke = args.includes("--revoke");

  const { auth } = initAdmin();
  const user = await auth.getUserByEmail(email);
  const { admin: _was, ...otherClaims } = user.customClaims ?? {};
  await auth.setCustomUserClaims(user.uid, revoke ? otherClaims : { ...otherClaims, admin: true });
  console.log(`${email} is ${revoke ? "no longer an admin" : "now an admin"}. Sign out and in again in the app to see the change.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
