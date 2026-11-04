import type { DeleteFailure, RebaseResult } from "../lib/types";

export type PaneMode =
  | "branches"
  | "commits"
  | "changes"
  | "tags"
  | "stash"
  | "workflows";
export type DiffMode = "unified" | "split";
export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface AlertMessage {
  title: string;
  message: string;
}

/** The stash whose diff the detail column is showing (`stash@{index}`). */
export interface StashPreview {
  index: number;
  selector: string;
}

export interface WorktreeTarget {
  path: string;
  staged: boolean;
}

export interface BranchActionResult {
  ok: boolean;
  deleted?: string[];
  failed?: DeleteFailure[];
  remoteDeleted?: string[];
  remoteFailed?: DeleteFailure[];
}

export interface PushOutcome {
  ok: boolean;
  code?: string;
  message?: string;
}

/** Shared result shape of push / pull (both can be rejected by the remote). */
export type OpOutcome = PushOutcome;

export interface RebaseOutcome extends OpOutcome {
  result?: RebaseResult;
}