import type { AdoMetadata, AdoQueryFolder } from "../../common/ado/AdoMetadata";
import type { ViewTypeSuggestionSource } from "../../common/view-common/ViewType";

/**
 * The vocabularies one metadata read answers in full.
 *
 * Saved-query folders are excluded on purpose: Azure DevOps will not enumerate them, so they are
 * grown a folder at a time (see `queryFoldersFromMetadata` and `QueryFolderVocabulary`).
 */
export type MetadataSuggestionSource = Exclude<ViewTypeSuggestionSource, "query-folders">;

/**
 * The project vocabulary one autocomplete property draws its suggestions from.
 *
 * Kept apart from the controller because it is the single place a view's declared source is turned
 * into Azure DevOps data: the controller stays about the form, and a new source has exactly one
 * place to be answered.
 */
export function suggestionsFromMetadata(
  metadata: AdoMetadata | null,
  source: MetadataSuggestionSource,
): readonly string[] {
  if (metadata === null) {
    return [];
  }
  switch (source) {
    case "area-paths":
      return metadata.areaPaths;
    case "iteration-paths":
      return metadata.iterationPaths;
  }
}

/** The saved-query folders the folder picker starts from, before anyone reaches deeper. */
export function queryFoldersFromMetadata(metadata: AdoMetadata | null): readonly AdoQueryFolder[] {
  return metadata?.queryFolders ?? [];
}
