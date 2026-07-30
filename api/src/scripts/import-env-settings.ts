/**
 * Import all currently used env keys into SystemSetting (overwrite).
 * Usage (inside API container):
 *   npx ts-node --transpile-only src/scripts/import-env-settings.ts
 */
import "dotenv/config";
import {
  loadRuntimeConfig,
  syncEnvOverSystemSettings,
  listSettingsForAdmin,
} from "../services/runtime-config.service";

async function main() {
  await loadRuntimeConfig();
  const count = await syncEnvOverSystemSettings("env-sync-script");
  const settings = await listSettingsForAdmin();
  console.log(`Synced ${count} keys from environment.`);
  for (const s of settings) {
    console.log(`  ${s.key}: ${s.isSet ? (s.isSecret ? "(secret set)" : s.value) : "(empty)"} [${s.storedInDb ? "db" : "env"}]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
