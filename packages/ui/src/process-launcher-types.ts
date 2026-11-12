import type {
  IGRPResolveStepComponent,
  IGRPProcessClientConfig,
} from "./types";

/** A process a user can start from the launcher menu. */
export interface IGRPLauncherProcess {
  /** Process row id (used as the menu item key). */
  id: string;
  /** Release id — sent as `processDefinitionId` when starting (as the process-map does). */
  releaseId: string;
  /** Process definition key — used to start the instance. */
  processKey: string;
  /** Display name (falls back to processKey when absent). */
  name: string;
  /** Short description shown under the name in the menu. */
  description?: string;
  /** Owning application code (`applicationBase`), needed to start. */
  applicationBase: string;
}

/** An area grouping launchable processes in the menu. */
export interface IGRPLauncherArea {
  id: string;
  code: string;
  name: string;
  processes: IGRPLauncherProcess[];
}

/** Parameters the modal feeds to `IGRPProcessPage` after a successful start. */
export interface IGRPLauncherTaskParams {
  processKey: string;
  processInstanceId: string;
  userTaskInstanceId: string;
  userTaskKey: string;
}

/** Result of starting a process from the launcher (serializable). */
export type IGRPLauncherStartResult =
  | {
      ok: true;
      /** Canonical instance id. */
      processInstanceId: string;
      /** Business process number (e.g. `PD-2026-121121`), for the toast. */
      processNumber: string;
      /**
       * The first user task, when the engine produced one immediately. `null`
       * means the process started but has no user task to open right now (async
       * branch, or first task assigned elsewhere) → the host shows a toast and
       * does not open the modal.
       */
      task: IGRPLauncherTaskParams | null;
    }
  | { ok: false; error: string };

/** Props for {@link IGRPProcessLauncherMenu}. */
export interface IGRPProcessLauncherMenuProps {
  /** Current application code (`IGRP_APP_CODE`). Scopes the listed processes. */
  appCode: string;
  /** Process-management API config (base URL + access token). */
  config: IGRPProcessClientConfig;
  /**
   * Resolve the step (form) component. The forms are app-generated code, so the
   * consuming app supplies this (dynamic import with a static prefix). Required
   * to render the form inside the modal.
   */
  resolveStepComponent: IGRPResolveStepComponent;
  /** Trigger label. Default: "Iniciar processo". */
  triggerLabel?: string;
  /** Group processes by area in the menu. Default: true. */
  groupByArea?: boolean;
  /** Called after a process is started (with or without an opened task). */
  onProcessStarted?: (info: {
    processInstanceId: string;
    processNumber: string;
    opened: boolean;
  }) => void;
}
