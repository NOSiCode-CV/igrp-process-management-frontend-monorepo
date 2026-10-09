"use client";
import { IGRPLoadingSpinner } from "@igrp/igrp-framework-react-design-system";
import { useIGRPProcessContext } from "./igrp-process-context";
import { IGRPProcessPageRenderer } from "./process-page-renderer";
import { IGRPProcessViewState } from "./components/process-view-state";

function IGRPProcessPage() {
  const {
    stepConfig,
    isLoadingStepConfig,
    stepConfigError,
    processKey,
    processInstanceId,
    userTaskKey,
    userTaskInstanceId,
    mode,
    fetchStepConfig,
  } = useIGRPProcessContext();

  // Pending (no data yet, no error) must look like loading — never the
  // error fallback. That flash happened when isLoadingStepConfig was still
  // false on the first paint before useEffect kicked off the fetch.
  if (isLoadingStepConfig || (!stepConfig && !stepConfigError)) {
    // Compact loader that stays inside the host shell layout — using
    // `h-screen` here used to take over the whole viewport on top of any
    // app chrome the consumer renders around <IGRPProcessPage />.
    return (
      <div className="flex w-full items-center justify-center py-16">
        <IGRPLoadingSpinner />
      </div>
    );
  }

  if (stepConfigError || !stepConfig) {
    return (
      <IGRPProcessViewState
        code={stepConfigError?.code ?? "UNKNOWN"}
        processRef={processInstanceId}
        reference={stepConfigError?.digest}
        onRetry={() => {
          fetchStepConfig().catch(() => {
            // Error is stored in `stepConfigError`.
          });
        }}
      />
    );
  }

  return (
    <IGRPProcessPageRenderer
      stepConfig={stepConfig}
      processKey={processKey}
      userTaskKey={userTaskKey ?? ""}
      processInstanceId={processInstanceId}
      userTaskInstanceId={userTaskInstanceId ?? ""}
      mode={mode}
    />
  );
}

export { IGRPProcessPage };
