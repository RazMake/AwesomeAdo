import type { DirectoryUser, IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";
import { renderFormTextField } from "../../../../common/view-common/control/FormLayout/FormLayout";

/** How long typing has to pause before the directory is asked, so each keystroke is not a request. */
export const CONTACT_LOOKUP_DELAY_MS = 300;

/** Fewer characters than this match half the directory, which helps nobody. */
const MIN_LOOKUP_LENGTH = 2;

export interface ContactNameFieldOptions {
  doc: Document;
  className: string;
  userDirectory: IUserDirectory;
  logger: ILogger;
  /** Typing settled on one directory identity, or the reader picked one of several. */
  onResolve(user: DirectoryUser): void;
  /** The typed name changed, so the owner can re-evaluate the form. */
  onInput(): void;
}

export interface ContactNameField {
  /** The text box plus the list of matches shown beneath it while there are several. */
  element: HTMLElement;
  input: HTMLInputElement;
  value(): string;
}

/** How a match is offered: the name, then the alias-bearing sign-in address that tells twins apart. */
function matchLabel(user: DirectoryUser): string {
  return user.uniqueName === null ? user.displayName : `${user.displayName} (${user.uniqueName})`;
}

/**
 * A contact's name, looked up in the Azure DevOps directory as it is typed.
 *
 * One match resolves at once — the owner fills the alias in — because that is the common case of
 * someone typing a colleague's full name. Several matches are listed under the box instead of
 * guessed between, because filling in the wrong person's alias is worse than asking. The list is in
 * the form's own flow rather than a floating popup, so the scrolling panel it sits in can never
 * clip it.
 */
export function renderContactNameField(options: ContactNameFieldOptions): ContactNameField {
  const { doc } = options;
  const shell = doc.createElement("div");
  shell.style.cssText = "display:flex;flex-direction:column;gap:2px;flex:1 1 0;min-width:0";
  const input = renderFormTextField(doc, { className: options.className, placeholder: "Name" });
  input.title = "The contact's full name; matching Azure DevOps users fill in the alias";
  const matches = doc.createElement("div");
  matches.className = `${options.className}-matches`;
  matches.style.cssText =
    "display:none;flex-direction:column;border:1px solid var(--control-border-strong);" +
    "border-radius:4px;background:var(--callout-background-color);max-height:120px;overflow-y:auto";
  shell.append(input, matches);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let asked = "";
  const hideMatches = (): void => {
    matches.style.display = "none";
    matches.replaceChildren();
  };
  const pick = (user: DirectoryUser): void => {
    input.value = user.displayName;
    hideMatches();
    options.onResolve(user);
    options.onInput();
  };
  const showMatches = (users: readonly DirectoryUser[]): void => {
    matches.replaceChildren(
      ...users.map((user) => renderMatch(doc, options.className, user, pick)),
    );
    matches.style.display = "flex";
  };
  const lookUp = async (query: string): Promise<void> => {
    asked = query;
    try {
      const users = await options.userDirectory.search(query);
      // A slower answer to an earlier query must not overwrite the list for what is typed now.
      if (asked !== query || input.value.trim() !== query) return;
      const [only] = users;
      if (users.length > 1) showMatches(users);
      else {
        hideMatches();
        if (only !== undefined) options.onResolve(only);
      }
    } catch (error) {
      options.logger.error("Could not look up a consumer contact in the directory", error);
      hideMatches();
    }
  };

  input.addEventListener("input", () => {
    options.onInput();
    if (timer !== null) clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < MIN_LOOKUP_LENGTH) {
      asked = "";
      hideMatches();
      return;
    }
    timer = setTimeout(() => void lookUp(query), CONTACT_LOOKUP_DELAY_MS);
  });

  return { element: shell, input, value: () => input.value.trim() };
}

function renderMatch(
  doc: Document,
  className: string,
  user: DirectoryUser,
  pick: (user: DirectoryUser) => void,
): HTMLButtonElement {
  const option = doc.createElement("button");
  option.type = "button";
  option.className = `${className}-match`;
  option.textContent = matchLabel(user);
  option.style.cssText =
    "border:0;padding:3px 6px;text-align:left;background:none;cursor:pointer;font:inherit;" +
    "font-size:12px;color:var(--text-primary-color)";
  option.addEventListener("mouseenter", () => {
    option.style.background = "var(--control-background-hover)";
  });
  option.addEventListener("mouseleave", () => {
    option.style.background = "none";
  });
  option.addEventListener("click", () => pick(user));
  return option;
}
