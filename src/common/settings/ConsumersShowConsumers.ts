import type { ISettingsStore } from "./ISettingsStore";

/**
 * The reader's per-query choice to open a Consumers View on the consumers who asked, each with its
 * feature requests, rather than on the requests-only list every board opens on by default.
 */
export interface ConsumersShowConsumers {
  read(queryId: string): Promise<boolean>;
  write(queryId: string, showConsumers: boolean): Promise<void>;
}

/**
 * The stored query-id list, cleaned: anything that is not a non-blank string is dropped, and a
 * repeated id keeps only its first place.
 */
export function normalizeConsumersShowConsumersQueryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.flatMap((id) =>
    typeof id === "string" && id.trim() !== "" ? [id.trim()] : [],
  );
  return [...new Set(ids)];
}

/**
 * Keeps the choice in the personal synced settings, so it follows the reader to every browser they
 * sign in to without ever reaching the team's shared configuration.
 *
 * Only the queries switched to the consumers are stored: the requests-only list is every board's
 * default, and a list of exceptions stays small inside the browser's per-item sync quota.
 */
export class PersonalConsumersShowConsumers implements ConsumersShowConsumers {
  constructor(private readonly settings: ISettingsStore) {}

  async read(queryId: string): Promise<boolean> {
    return (await this.settings.read()).consumersShowConsumersQueryIds.includes(queryId);
  }

  async write(queryId: string, showConsumers: boolean): Promise<void> {
    const current = (await this.settings.read()).consumersShowConsumersQueryIds;
    if (current.includes(queryId) === showConsumers) return;
    await this.settings.write({
      consumersShowConsumersQueryIds: showConsumers
        ? [...current, queryId]
        : current.filter((id) => id !== queryId),
    });
  }
}
