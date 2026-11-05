import { settingsSchema, type AppSettings } from "@/lib/schema";
import { getDb } from "./db";
import { guardedWrite } from "./write";

/** Read settings, filling any missing fields with defaults. */
export async function loadSettings(): Promise<AppSettings> {
  const raw = await getDb().settings.get("app");
  const parsed = settingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export type SettingsUpdater = (current: AppSettings) => AppSettings;

/** Read-modify-write inside a transaction so concurrent updates don't clobber each other. */
export async function updateSettings(updater: SettingsUpdater): Promise<AppSettings> {
  const db = getDb();
  return guardedWrite("your settings", () =>
    db.transaction("rw", db.settings, async () => {
      const current = await loadSettings();
      const next = settingsSchema.parse({
        ...updater(current),
        id: "app",
        updatedAt: new Date().toISOString(),
      });
      await db.settings.put(next);
      return next;
    }),
  );
}
