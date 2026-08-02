/** Which currently interrupt-tagged work items need their current acceptance lifetime resolved. */
export interface InterruptAcceptanceRequest {
  workItemIds: number[];
  interruptTag: string;
  acceptanceTag: string;
}

/** The accepted item ids established by one bulk read. Failed items are omitted, never guessed. */
export interface InterruptAcceptanceResult {
  acceptedWorkItemIds: number[];
  failedWorkItemIds: number[];
  error: string | null;
}

/** Resolves interrupt acceptance without exposing browser messaging to a view. */
export interface IInterruptAcceptanceReader {
  readInterruptAcceptance(request: InterruptAcceptanceRequest): Promise<InterruptAcceptanceResult>;
}
