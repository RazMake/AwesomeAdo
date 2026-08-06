import type { AdoQueryFolder } from "../../common/ado/AdoMetadata";

/** Reads the folders the picker starts from — one Azure DevOps request, never a crawl. */
export type ReadRootFolders = () => Promise<readonly AdoQueryFolder[]>;

/** Reads the folders directly inside one folder, asked for only when the user reaches into it. */
export type ReadFolderChildren = (folderPath: string) => Promise<readonly AdoQueryFolder[]>;

/** The collaborators the vocabulary needs, grouped so no caller passes a positional `undefined`. */
export interface QueryFolderVocabularyOptions {
  readRoot: ReadRootFolders;
  readChildren: ReadFolderChildren;
  /** Fired whenever the offered paths or the busy state change, so the form can redraw. */
  onChange: () => void;
  /** Records a refused read; suggestions are a convenience, so nothing else reacts to it. */
  onError: (error: unknown) => void;
}

/**
 * The saved-query folders the binding form suggests, grown one folder at a time.
 *
 * WHY this is not simply "the project's folders": Azure DevOps expands the saved-query hierarchy two
 * levels per request and caps a node at 1000 children, so a large project cannot be enumerated — and
 * walking towards the deeper folders up front costs hundreds of dependent requests, which is exactly
 * what made the folder field take minutes to fill. One read starts the list off; reaching into a
 * folder reads that folder, and only when Azure DevOps said it still holds something.
 *
 * Reads are never awaited by the form: the field stays typable throughout, a path that no suggestion
 * matches is still perfectly valid, and a refused read costs suggestions and nothing else.
 */
export class QueryFolderVocabulary {
  /** Every folder heard about so far, keyed by lower-cased path so ADO's own casing survives. */
  private readonly known = new Map<string, AdoQueryFolder>();
  private sorted: readonly string[] = [];
  /** Folders already asked about, so re-typing inside one costs nothing. */
  private readonly opened = new Set<string>();
  private rootRead = false;
  private pending = 0;

  constructor(private readonly options: QueryFolderVocabularyOptions) {}

  /** The folder paths on offer right now, sorted. */
  get paths(): readonly string[] {
    return this.sorted;
  }

  /** True while the first read is outstanding or a folder is being opened. */
  get loading(): boolean {
    return !this.rootRead || this.pending > 0;
  }

  /** Read the folders the picker starts from. Never rejects: a failure just leaves the list short. */
  async loadRoot(): Promise<void> {
    try {
      this.add(await this.options.readRoot());
    } catch (error: unknown) {
      this.options.onError(error);
    } finally {
      this.rootRead = true;
      this.options.onChange();
    }
  }

  /**
   * Open the folder `typed` names or sits inside, if Azure DevOps still has something to hand over.
   *
   * Deliberately not awaited by callers: this runs while the user keeps typing. "Reaching in" is
   * either naming a known folder outright or typing a path beneath it; the deepest such folder is
   * the one worth opening, and each is opened at most once.
   */
  expand(typed: string): void {
    const folder = this.folderToOpen(typed);
    if (folder === null) {
      return;
    }
    this.opened.add(folder.toLocaleLowerCase());
    this.pending++;
    // Announced before the read starts so the field shows it is busy for the whole wait.
    this.options.onChange();
    void this.options
      .readChildren(folder)
      .then((children) => this.add(children))
      .catch((error: unknown) => this.options.onError(error))
      .finally(() => {
        this.pending--;
        this.options.onChange();
      });
  }

  /** The deepest offered folder `typed` names or sits inside, if it is still closed and not empty. */
  private folderToOpen(typed: string): string | null {
    const text = typed.trim().toLocaleLowerCase();
    if (text === "") {
      return null;
    }
    let deepest: AdoQueryFolder | null = null;
    for (const folder of this.known.values()) {
      const candidate = folder.path.toLocaleLowerCase();
      if (text !== candidate && !text.startsWith(`${candidate}/`)) continue;
      if (deepest === null || folder.path.length > deepest.path.length) {
        deepest = folder;
      }
    }
    if (deepest === null || !deepest.hasUnreadChildren) {
      return null;
    }
    return this.opened.has(deepest.path.toLocaleLowerCase()) ? null : deepest.path;
  }

  private add(folders: readonly AdoQueryFolder[]): void {
    let changed = false;
    for (const folder of folders) {
      const key = folder.path.toLocaleLowerCase();
      const previous = this.known.get(key);
      // A folder read in full replaces the truncated stub that only promised more, so it is never
      // asked about a second time.
      if (previous === undefined || (previous.hasUnreadChildren && !folder.hasUnreadChildren)) {
        this.known.set(key, folder);
        changed ||= previous === undefined;
      }
    }
    if (changed) {
      this.sorted = [...this.known.values()]
        .map((folder) => folder.path)
        .sort((left, right) => left.localeCompare(right));
    }
  }
}
