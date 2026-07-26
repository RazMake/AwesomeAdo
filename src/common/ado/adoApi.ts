/**
 * The Azure DevOps REST API version every request in this extension targets.
 *
 * Single source of truth on purpose: the URL builders live in several modules (tree, metadata,
 * iterations, Feature Crew) and a version that drifts between them produces responses with
 * different shapes for the same data, which surfaces as a parse failure far from the cause.
 */
export const ADO_API_VERSION = "7.1";
