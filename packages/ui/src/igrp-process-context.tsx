"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useIGRPProcess } from "./use-igrp-process";
import type {
  IGRPGetFormDataForTaskOptions,
  IGRPProcessClientConfig,
  IGRPProcessMode,
  IGRPResolveStepComponent,
  IGRPStepConfigParams,
} from "./types";

export type IGRPProcessContextValue = ReturnType<typeof useIGRPProcess> & {
  /** Resolve step component (e.g. dynamic import in app). Required to render steps. */
  resolveStepComponent?: IGRPResolveStepComponent | null;
  /** execution = mutate CURRENT task; consultation = read-only step navigation. */
  mode: IGRPProcessMode;
  /** `true` in consultation (read-only). Prefer this over comparing `mode` strings. */
  readOnly: boolean;
  /** Currently selected step key (consultation). Null until initialized. */
  selectedStepKey: string | null;
  setSelectedStepKey: (stepKey: string | null) => void;
  /**
   * Optional exit handler. When set, the renderer calls it INSTEAD of navigating
   * (router.back / returnUrl / summary) after a task is completed, and hides the
   * page back button. This is what lets the process page live inside a modal
   * (e.g. the process launcher) — the host closes the modal instead of leaving
   * the page. Unset → the default page-navigation behaviour is unchanged.
   */
  onExit?: (() => void) | null;
};

const IGRPProcessContext = createContext<IGRPProcessContextValue | null>(null);

interface IGRPProcessProviderProps {
  children: ReactNode;
  params: IGRPStepConfigParams;
  config: IGRPProcessClientConfig;
  /** Resolve step component. App does dynamic import with static prefix. */
  resolveStepComponent?: IGRPResolveStepComponent | null;
  /**
   * Optional override. When omitted, inferred automatically:
   * - no `userTaskInstanceId` → consultation (read-only, step navigation)
   * - with `userTaskInstanceId` → execution
   */
  mode?: IGRPProcessMode;
  /**
   * When set, the page calls this instead of navigating after a completed task
   * and hides the back button — used to host the page inside a modal.
   */
  onExit?: (() => void) | null;
}

function resolveProcessMode(
  params: IGRPStepConfigParams,
  mode?: IGRPProcessMode,
): IGRPProcessMode {
  if (mode) return mode;
  return params.userTaskInstanceId ? "execution" : "consultation";
}

/**
 * Provider component that wraps the process context and makes it available to all children
 */
export function IGRPProcessProvider({
  children,
  params,
  config,
  resolveStepComponent = null,
  mode: modeProp,
  onExit = null,
}: IGRPProcessProviderProps) {
  const mode = resolveProcessMode(params, modeProp);
  const readOnly = mode === "consultation";
  const processContext = useIGRPProcess(params, config);
  const [selectedStepKey, setSelectedStepKey] = useState<string | null>(null);
  const { getFormDataByTaskKey, getFormDataForTask: getFormDataForTaskBase } =
    processContext;

  // In consultation, prefer history for the selected step so existing
  // `getFormDataForTask({ fallbackToHistory: true })` callers keep working.
  const getFormDataForTask = useCallback(
    (opts?: IGRPGetFormDataForTaskOptions) => {
      if (readOnly && selectedStepKey) {
        const fromHistory = getFormDataByTaskKey(selectedStepKey);
        if (fromHistory != null) return fromHistory;
      }
      return getFormDataForTaskBase(opts);
    },
    [readOnly, selectedStepKey, getFormDataByTaskKey, getFormDataForTaskBase],
  );

  return (
    <IGRPProcessContext.Provider
      value={{
        ...processContext,
        getFormDataForTask,
        resolveStepComponent,
        mode,
        readOnly,
        selectedStepKey,
        setSelectedStepKey,
        onExit,
      }}
    >
      {children}
    </IGRPProcessContext.Provider>
  );
}

/**
 * Hook to access the IGRP Process context
 * Must be used within an IGRPProcessProvider
 */
export function useIGRPProcessContext(): IGRPProcessContextValue {
  const context = useContext(IGRPProcessContext);

  if (!context) {
    throw new Error(
      "useIGRPProcessContext must be used within an IGRPProcessProvider",
    );
  }

  return context;
}
