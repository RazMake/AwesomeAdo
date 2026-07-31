import { afterEach, describe, expect, it } from "vitest";

import type { ILogger } from "../../../../common/logging/ILogger";

import {
  DragReorderController,
  type DraggableRow,
  type PlannedMove,
} from "./DragReorderController";

/** A `dataTransfer` stand-in: jsdom's synthetic events carry none, and Playwright is not in play. */
interface FakeDataTransfer {
  effectAllowed: string;
  dropEffect: string;
  payload: Record<string, string>;
  setData(format: string, value: string): void;
}

function fakeTransfer(): FakeDataTransfer {
  const payload: Record<string, string> = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    payload,
    setData(format, value) {
      payload[format] = value;
    },
  };
}

/**
 * Dispatches a drag event. jsdom implements no `DragEvent`, so the pointer position and the transfer
 * are grafted onto a plain `Event`; `cancelable` is what lets a test see `preventDefault`.
 */
function fire(target: HTMLElement, type: string, extras: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, extras);
  target.dispatchEvent(event);
  return event;
}

interface Board {
  controller: DragReorderController;
  moves: PlannedMove[];
  infos: string[];
  containerA: HTMLElement;
  containerB: HTMLElement;
  rows: Map<number, DraggableRow>;
}

/**
 * A board of two levels of the same depth — parent 10 holding rows 1-3, parent 20 holding rows 4-5
 * — plus one deeper row (6, a child of row 1) so a cross-level drop can be rejected.
 *
 * Every row's line box is stubbed because jsdom lays nothing out: with the real all-zero boxes the
 * before/after midpoint would never be exercised.
 */
function buildBoard(): Board {
  const moves: PlannedMove[] = [];
  const infos: string[] = [];
  const logger: ILogger = { info: (message) => infos.push(message), error: () => undefined };
  const controller = new DragReorderController(document, (move) => moves.push(move), logger);

  const containerA = document.createElement("div");
  const containerB = document.createElement("div");
  document.body.append(containerA, containerB);

  const rows = new Map<number, DraggableRow>();
  const add = (
    id: number,
    depth: number,
    parentId: number,
    siblingIds: number[],
    container: HTMLElement,
    top: number,
    hasChildren = false,
  ): void => {
    const wrapper = document.createElement("div");
    const row = document.createElement("div");
    const handle = document.createElement("span");
    row.append(handle);
    wrapper.append(row);
    container.append(wrapper);
    row.getBoundingClientRect = () => ({ top, height: 20, bottom: top + 20 }) as DOMRect;
    const descriptor: DraggableRow = {
      id,
      depth,
      hasChildren,
      parentId,
      destinationType: depth === 1 ? "Feature" : "User Story",
      siblingIds,
      handle,
      row,
      wrapper,
    };
    controller.register(descriptor);
    rows.set(id, descriptor);
  };

  add(1, 1, 10, [1, 2, 3], containerA, 0, true);
  add(2, 1, 10, [1, 2, 3], containerA, 20);
  add(3, 1, 10, [1, 2, 3], containerA, 40);
  add(4, 1, 20, [4, 5], containerB, 100);
  add(5, 1, 20, [4, 5], containerB, 120);
  const nested = document.createElement("div");
  rows.get(1)!.wrapper.append(nested);
  add(6, 2, 1, [6], nested, 200);

  return { controller, moves, infos, containerA, containerB, rows };
}

function startDrag(board: Board, id: number, withTransfer = true): FakeDataTransfer {
  const transfer = fakeTransfer();
  fire(board.rows.get(id)!.handle, "dragstart", withTransfer ? { dataTransfer: transfer } : {});
  return transfer;
}

function dragOver(
  board: Board,
  id: number,
  clientY?: number,
): { event: Event; transfer: FakeDataTransfer } {
  const transfer = fakeTransfer();
  const extras: Record<string, unknown> = { dataTransfer: transfer };
  if (clientY !== undefined) {
    extras.clientY = clientY;
  }
  return { event: fire(board.rows.get(id)!.row, "dragover", extras), transfer };
}

const drop = (board: Board, id: number, clientY: number): Event =>
  fire(board.rows.get(id)!.row, "drop", { clientY, dataTransfer: fakeTransfer() });

/** The children of `container`, with the insertion line named, so its position reads at a glance. */
const layoutOf = (container: HTMLElement): string[] =>
  [...container.children].map((child) =>
    child.classList.contains("awesomeado-tracking__drop-line") ? "line" : "row",
  );

const anyLine = (): Element | null => document.querySelector(".awesomeado-tracking__drop-line");

/** Whether `container` wears the "this is the new parent" wash. */
const isWashed = (container: HTMLElement): boolean =>
  container.style.getPropertyValue("outline").length > 0;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DragReorderController - registration", () => {
  it("makes the handle the grab affordance, and only the handle", () => {
    const board = buildBoard();
    const row = board.rows.get(1)!;

    expect(row.handle.draggable).toBe(true);
    expect(row.handle.style.cursor).toBe("grab");
    expect(row.row.draggable).toBe(false);
    expect(row.row.style.cursor).toBe("");
  });

  it("marks the row being dragged and seeds the transfer with its id", () => {
    const board = buildBoard();

    const transfer = startDrag(board, 1);

    expect(board.rows.get(1)!.handle.style.cursor).toBe("grabbing");
    expect(board.rows.get(1)!.wrapper.style.opacity).toBe("0.45");
    expect(transfer.effectAllowed).toBe("move");
    expect(transfer.payload["text/plain"]).toBe("1");
  });

  it("still starts a drag on a browser that hands over no transfer", () => {
    const board = buildBoard();

    startDrag(board, 1, false);
    drop(board, 3, 55);

    expect(board.moves).toHaveLength(1);
  });
});

describe("DragReorderController - previewing a drop", () => {
  it("slots the line above the target when the pointer is in its top half", () => {
    const board = buildBoard();
    startDrag(board, 1);

    dragOver(board, 3, 45);

    expect(layoutOf(board.containerA)).toEqual(["row", "row", "line", "row"]);
  });

  it("slots the line below the target when the pointer is in its bottom half", () => {
    const board = buildBoard();
    startDrag(board, 1);

    dragOver(board, 3, 55);

    expect(layoutOf(board.containerA)).toEqual(["row", "row", "row", "line"]);
  });

  it("accepts the row as a drop target and says the gesture is a move", () => {
    const board = buildBoard();
    startDrag(board, 1);

    const { event, transfer } = dragOver(board, 3, 55);

    // Without preventDefault the browser refuses the drop and shows the "no drop" cursor.
    expect(event.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");
  });

  it("falls back to 'before' for a row that has not been laid out yet", () => {
    const board = buildBoard();
    board.rows.get(3)!.row.getBoundingClientRect = () => ({ top: 0, height: 0 }) as DOMRect;
    startDrag(board, 1);

    dragOver(board, 3, 999);

    expect(layoutOf(board.containerA)).toEqual(["row", "row", "line", "row"]);
  });

  it("falls back to 'before' when the event carries no pointer position", () => {
    const board = buildBoard();
    startDrag(board, 1);

    dragOver(board, 3);

    expect(layoutOf(board.containerA)).toEqual(["row", "row", "line", "row"]);
  });

  it("closes a popup once the dragged child reaches a legal target outside it", () => {
    const board = buildBoard();
    const source = board.rows.get(6)!;
    const surface = source.wrapper.parentElement!;
    let closes = 0;
    source.dragSurface = surface;
    source.onLeaveSurface = () => {
      closes += 1;
    };
    startDrag(board, 6);

    dragOver(board, 2, 25);
    dragOver(board, 3, 45);

    expect(closes).toBe(1);
  });

  it("does not treat a bubbled event inside a popup as a tree reparent", () => {
    const board = buildBoard();
    const source = board.rows.get(6)!;
    const surface = source.wrapper.parentElement!;
    board.rows.get(1)!.row.append(surface);
    let closes = 0;
    source.dragSurface = surface;
    source.onLeaveSurface = () => {
      closes += 1;
    };
    startDrag(board, 6);

    dragOver(board, 6, 205);
    drop(board, 6, 205);

    expect(anyLine()).toBeNull();
    expect(board.moves).toEqual([]);
    expect(closes).toBe(0);
  });
});

describe("DragReorderController - drops it refuses", () => {
  it("refuses to demote a parent that still has children", () => {
    const board = buildBoard();
    startDrag(board, 1);

    const { event } = dragOver(board, 6, 205);
    drop(board, 6, 205);

    expect(anyLine()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(board.moves).toEqual([]);
  });

  it("refuses a drop more than one hierarchy level away", () => {
    const board = buildBoard();
    board.rows.get(6)!.depth = 3;
    startDrag(board, 2);

    const { event } = dragOver(board, 6, 205);

    expect(event.defaultPrevented).toBe(false);
    expect(anyLine()).toBeNull();
  });

  it("shows nothing when the pointer is over the dragged row itself", () => {
    const board = buildBoard();
    startDrag(board, 1);

    dragOver(board, 1, 15);

    expect(anyLine()).toBeNull();
  });

  it("shows nothing when no drag is in progress", () => {
    const board = buildBoard();

    dragOver(board, 3, 55);
    drop(board, 3, 55);

    expect(anyLine()).toBeNull();
    expect(board.moves).toEqual([]);
  });

  it("withdraws the line once the pointer returns to the item's own slot", () => {
    const board = buildBoard();
    startDrag(board, 1);
    dragOver(board, 3, 55);

    // Dropping 1 before 2 would put it back exactly where it already is.
    dragOver(board, 2, 25);

    expect(anyLine()).toBeNull();
  });

  it("does not report a drop that would change nothing", () => {
    const board = buildBoard();
    startDrag(board, 1);

    drop(board, 2, 25);

    expect(board.moves).toEqual([]);
    expect(board.infos).toEqual([]);
  });
});

describe("DragReorderController - completing a same-level drop", () => {
  it("reports the resolved placement for a move within one parent", () => {
    const board = buildBoard();
    startDrag(board, 1);

    const event = drop(board, 3, 55);

    expect(board.moves).toEqual([
      { id: 1, currentParentId: 10, parentId: 10, previousId: 3, nextId: 0, siblingIds: [2, 3, 1] },
    ]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports both parents when the drop also re-homes the item", () => {
    const board = buildBoard();
    startDrag(board, 1);

    drop(board, 4, 105);

    expect(board.moves).toEqual([
      {
        id: 1,
        currentParentId: 10,
        parentId: 20,
        previousId: 0,
        nextId: 4,
        siblingIds: [1, 4, 5],
        type: "Feature",
      },
    ]);
  });

  it("logs the signals that decided the landing plus its outcome", () => {
    const board = buildBoard();
    startDrag(board, 1);

    drop(board, 3, 55);

    expect(board.infos).toEqual([
      "Drag-reorder: item 1 dropped after item 3 at depth 1; parent 10→10, between 3 and 0",
    ]);
  });

  it("ends the session on drop, so a repeated drop cannot move the item twice", () => {
    const board = buildBoard();
    startDrag(board, 1);

    drop(board, 3, 55);
    drop(board, 3, 55);

    expect(board.moves).toHaveLength(1);
  });

  it("clears the feedback as the drop completes", () => {
    const board = buildBoard();
    startDrag(board, 1);
    dragOver(board, 3, 55);

    drop(board, 3, 55);

    expect(anyLine()).toBeNull();
    expect(board.rows.get(1)!.wrapper.style.opacity).toBe("");
  });
});

describe("DragReorderController - completing a hierarchy drop", () => {
  it("promotes an item between the rows one level above it", () => {
    const board = buildBoard();
    startDrag(board, 6);

    drop(board, 2, 25);

    expect(board.moves).toEqual([
      {
        id: 6,
        currentParentId: 1,
        parentId: 10,
        previousId: 1,
        nextId: 2,
        siblingIds: [1, 6, 2, 3],
        type: "Feature",
      },
    ]);
  });

  it("demotes a leaf at the exact position targeted among the new parent's children", () => {
    const board = buildBoard();
    startDrag(board, 2);

    drop(board, 6, 215);

    expect(board.moves).toEqual([
      {
        id: 2,
        currentParentId: 10,
        parentId: 1,
        previousId: 6,
        nextId: 0,
        siblingIds: [6, 2],
        type: "User Story",
      },
    ]);
  });
});

describe("DragReorderController - ending a session", () => {
  it("restores the row it dimmed when the drag is abandoned", () => {
    const board = buildBoard();
    startDrag(board, 1);
    dragOver(board, 3, 55);

    fire(board.rows.get(1)!.handle, "dragend");

    expect(anyLine()).toBeNull();
    expect(board.rows.get(1)!.wrapper.style.opacity).toBe("");
    expect(board.rows.get(1)!.handle.style.cursor).toBe("grab");
  });

  it("tolerates a dragend with no session, which a cancelled drag can produce", () => {
    const board = buildBoard();

    fire(board.rows.get(1)!.handle, "dragend");

    expect(anyLine()).toBeNull();
  });

  it("drops the in-flight drag on reset, so rows from the previous pass move nothing", () => {
    const board = buildBoard();
    startDrag(board, 1);
    dragOver(board, 3, 55);

    board.controller.reset();
    drop(board, 3, 55);

    expect(anyLine()).toBeNull();
    expect(board.moves).toEqual([]);
  });
});

describe("DragReorderController - the re-parent wash", () => {
  it("washes the destination level when the drop changes parent", () => {
    const board = buildBoard();
    startDrag(board, 1);

    dragOver(board, 4, 105);

    expect(isWashed(board.containerB)).toBe(true);
    expect(isWashed(board.containerA)).toBe(false);
  });

  it("leaves every level unwashed when the item keeps its parent", () => {
    const board = buildBoard();
    startDrag(board, 1);

    dragOver(board, 3, 55);

    expect(isWashed(board.containerA)).toBe(false);
    expect(isWashed(board.containerB)).toBe(false);
  });

  it("takes the wash off once the drag ends", () => {
    const board = buildBoard();
    startDrag(board, 1);
    dragOver(board, 4, 105);

    fire(board.rows.get(1)!.handle, "dragend");

    expect(isWashed(board.containerB)).toBe(false);
  });
});
