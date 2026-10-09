// Types
export * from "./types";

// Form key / discovery helpers (ui:shared:* vs ui:form:*)
export {
  DEFAULT_FORM_KEY,
  formFromFormKey,
  getFormDiscovery,
  getFormKeyType,
  getKeyFromFormKey,
  getNameFromFormKey,
  getNormalizeClassNameFromFormKey,
  getNormalizedFormKey,
  getVersionFromFormKey,
  isFormFormKey,
  isSharedFormKey,
  isVersionFolderName,
} from "./lib/form-key-utils";
export type { FormKeyType, IGRPFormDiscovery } from "./lib/form-key-utils";

export {
  IGRPProcessError,
  toProcessError,
  toProcessErrorPayload,
} from "./lib/process-error";
export type {
  IGRPProcessErrorCode,
  IGRPProcessErrorPayload,
} from "./lib/process-error";

export {
  isProcessInstanceUuid,
  resolveProcessInstance,
} from "./lib/resolve-process-instance";

// Return URL após completar tarefa (origem do link / config runtime)
export {
  IGRP_RETURN_URL_PARAM,
  isExternalReturnUrl,
  resolveSummaryPageHref,
  resolveTaskReturnTarget,
} from "./lib/task-return-url";
export type { IGRPTaskReturnTarget } from "./lib/task-return-url";

export {
  IGRP_PROCESS_MANAGEMENT_PAGES,
  processManagementAppHref,
  processManagementAppUrls,
  resolveProcessManagementAppBase,
} from "./lib/process-management-app-url";
export type { IGRPProcessManagementPage } from "./lib/process-management-app-url";

// Process actions (server actions – ficheiro tem "use server")
export {
  fetchStepConfig,
  fetchStepConfigSafe,
  callCompleteTask,
  callSaveTask,
} from "./process-actions";
export type { IGRPFetchStepConfigSafeResult } from "./process-actions";

// Context & hook
export {
  IGRPProcessProvider,
  useIGRPProcessContext,
} from "./igrp-process-context";
export type { IGRPProcessContextValue } from "./igrp-process-context";

// Hook
export { useIGRPProcess } from "./use-igrp-process";

// Components
export { IGRPProcessPage } from "./process-page";
export { IGRPProcessPageRenderer } from "./process-page-renderer";
export { IGRPConfirmationDialog } from "./components/igrp-confirmation-dialog";
export type { IGRPConfirmationDialogProps } from "./components/igrp-confirmation-dialog";
export { IGRPProcessViewState } from "./components/process-view-state";
export type { IGRPProcessViewStateProps } from "./components/process-view-state";
