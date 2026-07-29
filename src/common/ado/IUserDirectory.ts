/**
 * A directory user (from an ADO team member roster or an identity search).
 */
export interface DirectoryUser {
  /** The local ADO identity GUID, when the picker supplied one; required for an `@` reference. */
  id?: string | null;
  displayName: string;
  uniqueName: string | null;
  imageUrl: string | null;
}

/**
 * The user directory: search for team members and resolve a name to its identity.
 *
 * Used by Project Tracking's assignee-picker and other views that need to map a string to a user.
 * The real implementation queries Azure DevOps' identity and team APIs; a placeholder returns empty.
 */
export interface IUserDirectory {
  /** Search for users by display name or unique name (email). */
  search(query: string): Promise<DirectoryUser[]>;
  /** Resolve a display name or unique name to a single user, returning null when not found. */
  resolve(nameOrUnique: string): Promise<DirectoryUser | null>;
}
