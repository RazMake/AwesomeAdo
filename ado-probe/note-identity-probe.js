/*
 * Note-ownership probe (v2).
 *
 * WHY: the "edit your own note" affordance only appears when the signed-in reader matches a note's
 * author. Two different faults look identical from the board: (a) we never learn who the reader IS,
 * or (b) we learn it, but Azure DevOps attributes the note under a different one of the several
 * GUIDs it issues per person. This tells the two apart.
 *
 * v2 fixes: the project segment is already URL-encoded in the address bar, so it must be DECODED
 * before being re-encoded (v1 sent "O365%2520Core" and got a 404), and every failing body is now
 * printed — an ADO 400 names the API versions it will actually accept.
 *
 * HOW TO RUN
 *   1. Open the ADO tab you use the extension on (any project-scoped page, e.g. a query or board).
 *   2. F12 -> Console. If the console shows a "paste is disabled" warning, type: allow pasting
 *   3. Set WORK_ITEM_ID below to an item where YOU have written at least one note, then paste.
 *
 * Everything is a read-only GET. Values are MASKED by default (GUIDs to their first 8 characters,
 * addresses to their domain) — the comparisons run on the full values, so the verdicts stay exact
 * while the output stays safe to paste into a chat. ADO's own error messages are printed verbatim:
 * they describe the endpoint, not you. Flip REVEAL to true for raw values for your own eyes.
 */
(async () => {
  const WORK_ITEM_ID = 7623516; // <-- REQUIRED: an item where you wrote a note
  const REVEAL = false; // true = print raw GUIDs / addresses / names

  const COMMENTS_API_VERSION = "7.1-preview.4"; // must match ADO_COMMENTS_API_VERSION
  const API_VERSION = "7.1"; // must match ADO_API_VERSION

  if (!WORK_ITEM_ID) {
    console.error("Set WORK_ITEM_ID to a work item where YOU wrote a note, then re-run.");
    return;
  }

  const mask = (value) => {
    if (typeof value !== "string") return value === undefined ? "(absent)" : `(${typeof value})`;
    if (value.length === 0) return "(empty string)";
    if (REVEAL) return value;
    if (value.includes("@")) return `***@${value.split("@").pop()}`;
    return `${value.slice(0, 8)}… (len ${value.length})`;
  };

  const get = async (url) => {
    let response;
    try {
      response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
      });
    } catch (error) {
      return { status: 0, body: null, problem: `fetch threw: ${String(error)}` };
    }
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      return {
        status: response.status,
        body: null,
        problem: `not JSON (${text.slice(0, 60).replace(/\s+/g, " ")}…)`,
      };
    }
    // ADO's error shape, printed VERBATIM: an unsupported-api-version 400 names the versions that
    // are supported, which is the entire answer to "why did this fail". It describes the endpoint,
    // not you, so it is safe to paste.
    const problem = response.ok
      ? undefined
      : `${body?.typeKey ?? "error"}: ${body?.message ?? "(no message)"}`;
    return { status: response.status, body, problem };
  };

  // Same derivation the extension uses: on dev.azure.com the org is a path segment, on the legacy
  // {org}.visualstudio.com host the org IS the host.
  // Path segments arrive ALREADY ENCODED ("O365%20Core"); decoding first is what stops the re-encode
  // below turning them into "O365%2520Core" and 404-ing.
  const url = new URL(location.href);
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const onDevAzure = url.hostname === "dev.azure.com";
  const org = onDevAzure ? segments[0] : url.hostname.split(".")[0];
  const project = onDevAzure ? segments[1] : segments[0];
  const base = onDevAzure ? `${url.origin}/${encodeURIComponent(org)}` : url.origin;
  console.log("=== context ===", { base, org, project, segments });
  if (!project) {
    console.error("This page is not project-scoped. Open a query/board inside a project.");
    return;
  }

  // --- 1. who ADO says I am, tried every way we have -----------------------
  // The extension makes exactly the FIRST of these calls. The rest are here to find one this org
  // will actually answer, and to show which identity that answer carries.
  const identitySources = [
    {
      label: "ConnectionData (extension's call)",
      url: `${base}/_apis/ConnectionData?api-version=${API_VERSION}`,
    },
    { label: "ConnectionData no api-version", url: `${base}/_apis/ConnectionData` },
    { label: "ConnectionData 1.0", url: `${base}/_apis/ConnectionData?api-version=1.0` },
    { label: "ConnectionData 5.0", url: `${base}/_apis/ConnectionData?api-version=5.0` },
    { label: "ConnectionData 6.0", url: `${base}/_apis/ConnectionData?api-version=6.0` },
    { label: "ConnectionData 7.0", url: `${base}/_apis/ConnectionData?api-version=7.0` },
    {
      label: "ConnectionData web-UI style",
      url: `${base}/_apis/connectionData?connectOptions=None&lastChangeId=-1&lastChangeId64=-1`,
    },
    {
      label: "project-scoped ConnectionData",
      url: `${base}/${encodeURIComponent(project)}/_apis/ConnectionData?api-version=${API_VERSION}`,
    },
  ];

  const handlesOf = (identity) => {
    if (!identity || typeof identity !== "object") return null;
    return {
      id: identity.id,
      account: identity.properties?.Account?.$value,
      subjectDescriptor: identity.subjectDescriptor,
      descriptor:
        typeof identity.descriptor === "string"
          ? identity.descriptor
          : identity.descriptor?.identifier,
      displayName: identity.providerDisplayName ?? identity.customDisplayName,
    };
  };

  const identityRows = [];
  let authenticated = null;
  let authorized = null;
  for (const source of identitySources) {
    const result = await get(source.url);
    const auth = handlesOf(result.body?.authenticatedUser);
    const authz = handlesOf(result.body?.authorizedUser);
    if (auth && !authenticated) authenticated = auth;
    if (authz && !authorized) authorized = authz;
    identityRows.push({
      source: source.label,
      status: result.status,
      bodyKeys: result.body ? Object.keys(result.body).join(",").slice(0, 90) : "(none)",
      problem: result.problem ?? "",
      "authenticated.id": auth ? mask(auth.id) : "(none)",
      "authenticated.account": auth ? mask(auth.account) : "(none)",
      "authorized.id": authz ? mask(authz.id) : "(none)",
    });
  }
  console.log("=== 1. identity sources ===");
  console.table(identityRows);
  console.log(
    "first usable identity:",
    authenticated
      ? {
          id: mask(authenticated.id),
          account: mask(authenticated.account),
          subjectDescriptor: mask(authenticated.subjectDescriptor),
          descriptor: mask(authenticated.descriptor),
          sameAsAuthorized: authenticated.id === authorized?.id,
        }
      : "NONE — this alone makes every note read-only",
  );

  // --- 2. who ADO says wrote the notes -------------------------------------
  const commentsUrl =
    `${base}/${encodeURIComponent(project)}/_apis/wit/workItems/${WORK_ITEM_ID}/comments` +
    `?api-version=${COMMENTS_API_VERSION}&$top=50&order=desc&$expand=renderedText`;
  const comments = await get(commentsUrl);
  console.log("=== 2. comments ===", {
    url: commentsUrl,
    status: comments.status,
    problem: comments.problem,
    count: comments.body?.comments?.length ?? null,
    createdByKeys: comments.body?.comments?.[0]
      ? Object.keys(comments.body.comments[0].createdBy ?? {}).join(",")
      : null,
  });

  const authors = new Map();
  for (const comment of comments.body?.comments ?? []) {
    const by = comment.createdBy ?? {};
    const key = `${by.id}|${by.uniqueName}`;
    if (!authors.has(key)) authors.set(key, { by, notes: 0 });
    authors.get(key).notes += 1;
  }

  // --- 3. what the extension would decide ----------------------------------
  const lower = (v) => (typeof v === "string" && v.length > 0 ? v.toLowerCase() : null);
  const same = (a, b) => lower(a) !== null && lower(a) === lower(b);

  // Today's rule: the GUID DECIDES whenever both sides have one — the address is never consulted.
  const currentRule = (author) => {
    if (authenticated === null) return false;
    if (lower(authenticated.id) && lower(author.id)) return same(authenticated.id, author.id);
    return same(authenticated.account, author.uniqueName);
  };

  // Candidate rule: ANY handle matching is enough, against EITHER reported identity.
  const anyHandleRule = (author) =>
    [authenticated, authorized].some(
      (reader) =>
        reader !== null &&
        (same(reader.id, author.id) ||
          same(reader.account, author.uniqueName) ||
          same(reader.descriptor, author.descriptor)),
    );

  const rows = [...authors.values()].map(({ by, notes }) => ({
    notes,
    authorDisplayName: mask(by.displayName),
    authorId: mask(by.id),
    authorUniqueName: mask(by.uniqueName),
    authorDescriptor: mask(by.descriptor),
    "id === authenticated.id": same(by.id, authenticated?.id),
    "id === authorized.id": same(by.id, authorized?.id),
    "uniqueName === Account": same(by.uniqueName, authenticated?.account),
    "descriptor matches": same(by.descriptor, authenticated?.descriptor),
    EDITABLE_TODAY: currentRule(by),
    EDITABLE_IF_ANY_HANDLE: anyHandleRule(by),
  }));
  console.log("=== 3. per author: would the name be clickable? ===");
  console.table(rows);
})();
