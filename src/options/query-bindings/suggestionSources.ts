import type { AdoMetadata } from "../../common/ado/AdoMetadata";
import type { ViewTypeSuggestionSource } from "../../common/view-common/ViewType";

/**
 * The project vocabulary one autocomplete property draws its suggestions from.
 *
 * Kept apart from the controller because it is the single place a view's declared source is turned
 * into Azure DevOps data: the controller stays about the form, and a new source has exactly one
 * place to be answered.
 */
export function suggestionsFromMetadata(
  metadata: AdoMetadata | null,
  source: ViewTypeSuggestionSource,
): readonly string[] {
  if (metadata === null) {
    return [];
  }
  switch (source) {
    case "area-paths":
      return metadata.areaPaths;
    case "iteration-paths":
      return metadata.iterationPaths;
    case "query-folders":
      return metadata.queryFolders;
  }
}
