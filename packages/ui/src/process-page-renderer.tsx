"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { flushSync } from "react-dom";
import {
  IGRPPageHeader,
  IGRPButton,
  IGRPIcon,
  IGRPLoadingSpinner,
  IGRPStepperProcess,
  Card,
  CardContent,
  useIGRPToast,
} from "@igrp/igrp-framework-react-design-system";
import { ProcessDetailsCard } from "./components/process-details-card";
import type {
  Form,
  IGRPStepComponentConfig,
  IGRPStepComponentProps,
  IGRPStepMethods,
  IGRPProcessPageRendererProps,
  IGRPStepResult,
  StepResolverProps,
} from "./types";
import { IGRPConfirmationDialog } from "./components/igrp-confirmation-dialog";
import { useIGRPProcessContext } from "./igrp-process-context";
import {
  isExternalReturnUrl,
  resolveSummaryPageHref,
  resolveTaskReturnTarget,
} from "./lib/task-return-url";

/** Let the browser paint the button spinner before heavy `completeStep` work. */
function yieldForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

const IGRPStepLoading = ({ userTaskKey }: { userTaskKey: string }) => (
  <div className="flex flex-col items-center justify-center h-full">
    <IGRPLoadingSpinner />
    <p className="text-sm text-gray-500">A carregar o passo {userTaskKey}...</p>
  </div>
);

/** Fallback quando o step não é encontrado (ex.: módulo não existe em runtime). */
const StepLoadError = ({
  processKey,
  version,
  userTaskKey,
  message,
}: {
  processKey: string;
  version: string;
  userTaskKey: string;
  message?: string;
}) => (
  <div className="flex flex-col items-center justify-center h-full min-h-[120px] p-4 text-amber-600">
    <p className="text-sm font-medium">Componente do step não encontrado</p>
    <p className="text-xs mt-1 text-center">
      {processKey} / {version} / {userTaskKey}
    </p>
    {message && (
      <p
        className="text-xs mt-1 text-red-500 truncate max-w-full"
        title={message}
      >
        {message}
      </p>
    )}
  </div>
);

function StepResolver({
  resolve,
  params,
  config,
  loadingFallback,
}: StepResolverProps) {
  const [Component, setComponent] =
    useState<ComponentType<IGRPStepComponentProps> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    setError(null);

    const load = (): Promise<ComponentType<IGRPStepComponentProps>> => {
      if (typeof resolve === "function") return resolve(params);
      if (resolve && typeof resolve === "object" && "default" in resolve) {
        const d = (
          resolve as { default: ComponentType<IGRPStepComponentProps> }
        ).default;
        if (d != null) return Promise.resolve(d);
      }
      return Promise.reject(new Error("resolveStepComponent inválido"));
    };

    load()
      .then((C) => {
        if (!cancelled) setComponent(() => C);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [
    resolve,
    params.processKey,
    params.version,
    params.userTaskKey,
    params.processName,
    params.form,
  ]);

  if (error) {
    return (
      <StepLoadError
        processKey={params.processKey}
        version={params.version}
        userTaskKey={params.userTaskKey}
        message={error.message}
      />
    );
  }
  if (!Component) return <>{loadingFallback}</>;
  return <Component config={config} />;
}

const DEFAULT_FORM: Form = {
  type: "shared",
  page: "default.v1",
  version: "1",
};

export default function IGRPProcessPageRenderer({
  stepConfig,
  processKey,
  userTaskKey,
  processInstanceId,
  userTaskInstanceId,
  resolveStepComponent: resolveStepComponentProp,
  mode: modeProp = "execution",
}: IGRPProcessPageRendererProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [stepMethods, setStepMethods] = useState<IGRPStepMethods | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // Latches `true` once `completeTask` succeeds. Drives:
  //  - hiding Save / Complete Task buttons (no double-submit)
  //  - locking the step content so the user can't keep editing
  //  - opening the success dialog as non-dismissable (user must press Voltar)
  const [taskCompleted, setTaskCompleted] = useState(false);
  // Covers `saveStep` / `completeStep` (app) before the lib's save/complete
  // server actions set `isLoading`. Without this the buttons stay idle until
  // recibo / APIs / notify-next-task finish their first await.
  const [isActionPending, setIsActionPending] = useState(false);

  const { igrpToast } = useIGRPToast();
  const router = useRouter();
  const {
    completeTask,
    saveTask,
    isLoading,
    resolveStepComponent: resolveStepComponentContext,
    mode: modeContext,
    selectedStepKey,
    setSelectedStepKey,
    config,
  } = useIGRPProcessContext();

  const isBusy = isLoading || isActionPending;

  const mode = modeProp || modeContext || "execution";
  const isConsultation = mode === "consultation";

  const {
    processInstance,
    steps,
    variables,
    form,
    activityProgress,
    formsByStepKey,
    taskIdsByStepKey,
  } = stepConfig || {};

  const { name, version, statusDesc, number } = processInstance || {};

  /**
   * Compat layer — the backend returns `userTaskKey: null`, marks every
   * entry in `steps[]` as `isCompleted: true` once executed, and emits
   * `steps[]` in a visual order that does NOT always match the engine's
   * cronological flow (e.g. when a BPMN gateway routes around a branch the
   * step that comes later in execution may appear earlier in `steps[]`).
   *
   * `activityProgress` is the authoritative source: it has one entry per
   * activity with a `status` of `CURRENT`, `COMPLETED` or `PENDING`. We map
   * each step in the definition to its `status` and recompute the flags
   * directly — never using the position inside `steps[]` because that
   * position is unreliable.
   *
   * - `CURRENT` step → active, not completed.
   * - `COMPLETED` step → completed, not active.
   * - `PENDING` / not in activityProgress → grey (not yet visited).
   * - No `CURRENT` anywhere → assume the process finished, mark every step
   *   as completed.
   */
  const effectiveUserTaskKey = useMemo(() => {
    const current = (activityProgress || []).find(
      (a) => a.status === "CURRENT",
    );
    return current?.activityId ?? userTaskKey ?? null;
  }, [activityProgress, userTaskKey]);

  const effectiveSteps = useMemo(() => {
    if (!steps || steps.length === 0) return steps;

    // `steps[]` comes ordered by visual position in the BPMN diagram, which
    // does not always match the engine's execution order — branches routed
    // through gateways can show up out of sequence. `activityProgress` lists
    // activities in real chronological order (with PENDING entries already
    // sorted by the engine's planned next path), so we use it as the source
    // of truth for ordering too.
    const stepsByKey = new Map(steps.map((s) => [s.stepKey, s]));
    const orderedKeys: string[] = [];
    (activityProgress || []).forEach((a) => {
      const activityId = a.activityId;
      if (
        activityId &&
        stepsByKey.has(activityId) &&
        !orderedKeys.includes(activityId)
      ) {
        orderedKeys.push(activityId);
      }
    });
    // Defensive: any step that never showed up in `activityProgress` keeps
    // its original relative position at the tail of the list.
    steps.forEach((s) => {
      if (!orderedKeys.includes(s.stepKey)) {
        orderedKeys.push(s.stepKey);
      }
    });

    const progressByActivity = new Map<string, string>();
    (activityProgress || []).forEach((a) => {
      if (a.activityId) {
        progressByActivity.set(a.activityId, a.status ?? "");
      }
    });
    const hasCurrent = Array.from(progressByActivity.values()).includes(
      "CURRENT",
    );

    return orderedKeys.map((key, index) => {
      const s = stepsByKey.get(key)!;
      const status = progressByActivity.get(key);
      const stepNumber = index + 1;
      if (status === "CURRENT") {
        return {
          ...s,
          step: stepNumber,
          isCompleted: false,
          isActive: true,
          isSkipped: false,
        };
      }
      if (status === "COMPLETED") {
        return {
          ...s,
          step: stepNumber,
          isCompleted: true,
          isActive: false,
          isSkipped: false,
        };
      }
      // PENDING, or activity not visited yet by the engine.
      return {
        ...s,
        step: stepNumber,
        isCompleted: !hasCurrent,
        isActive: false,
        isSkipped: false,
      };
    });
  }, [steps, activityProgress]);

  // Steps the engine actually ran: present in `activityProgress` as CURRENT or
  // COMPLETED. A step in the definition but absent here (or PENDING) was never
  // executed — e.g. a branch a BPMN gateway routed around (DG authorization
  // that this process skipped). `effectiveSteps` can't tell these apart on its
  // own: once the process finishes (no CURRENT) its fallback marks every
  // not-visited step `isCompleted`, so a skipped branch looks green.
  const executedStepKeys = useMemo(() => {
    const keys = new Set<string>();
    (activityProgress || []).forEach((a) => {
      if (a.activityId && (a.status === "CURRENT" || a.status === "COMPLETED")) {
        keys.add(a.activityId);
      }
    });
    return keys;
  }, [activityProgress]);

  // Consultation: show ONLY the steps that were executed (a read-only history
  // of what the process actually did), renumbered 1..n so the hidden skipped
  // steps leave no gaps. Also enable click on COMPLETED + CURRENT by flipping
  // isActive — IGRPStepperProcess uses `disabled={!isActive}`; visual state
  // still comes from `completed={isCompleted}` + the controlled `currentStep`.
  // Execution keeps the full planned flow (upcoming PENDING steps included) so
  // the user sees what is still ahead.
  const displaySteps = useMemo(() => {
    if (!isConsultation || !effectiveSteps) return effectiveSteps;
    return effectiveSteps
      .filter((s) => executedStepKeys.has(s.stepKey))
      .map((s, index) => ({
        ...s,
        step: index + 1,
        isActive: s.isCompleted || s.isActive,
      }));
  }, [isConsultation, effectiveSteps, executedStepKeys]);

  // Default selected step in consultation: CURRENT → last COMPLETED → first.
  // Picks from `displaySteps` (the executed, visible steps), never from the
  // full `effectiveSteps`: a skipped step can be flagged `isCompleted` by the
  // finished-process fallback, and selecting it would point `viewedStepKey` at
  // a step that isn't in the stepper — so nothing would load.
  useEffect(() => {
    if (!isConsultation || selectedStepKey || !displaySteps?.length) return;
    const lastCompleted = [...displaySteps]
      .reverse()
      .find((s) => s.isCompleted)?.stepKey;
    const initial =
      effectiveUserTaskKey || lastCompleted || displaySteps[0]?.stepKey;
    if (initial) setSelectedStepKey(initial);
  }, [
    isConsultation,
    selectedStepKey,
    displaySteps,
    effectiveUserTaskKey,
    setSelectedStepKey,
  ]);

  const viewedStepKey = isConsultation
    ? selectedStepKey || effectiveUserTaskKey
    : effectiveUserTaskKey;

  const resolveStepComponent =
    resolveStepComponentProp ?? resolveStepComponentContext ?? null;

  /**
   * Saída do popup de sucesso: volta ao projecto de origem (`?returnUrl=`),
   * senão à lista de tarefas configurada, senão ao history do browser.
   * Resolvido no click (não em render) porque depende de `window`.
   */
  const goToHref = useCallback(
    (href: string) => {
      if (isExternalReturnUrl(href)) {
        window.location.replace(href);
        return;
      }
      router.replace(href as any);
    },
    [router],
  );

  const handleReturnAfterComplete = useCallback(() => {
    const target = resolveTaskReturnTarget({
      configuredUrl: config?.taskReturnUrl,
      search: window.location.search,
      canGoBack: window.history.length > 1,
    });

    if (target.kind === "history-back") {
      router.back();
      return;
    }

    goToHref(target.href);
  }, [config?.taskReturnUrl, goToHref, router]);

  // Callback to register step methods
  const handleRegisterMethods = useCallback((methods: IGRPStepMethods) => {
    setStepMethods(methods);
  }, []);

  // Handle save action
  const handleSave = async () => {
    if (taskCompleted || isBusy) {
      return { success: false, error: "Já submetido" };
    }
    flushSync(() => {
      setIsActionPending(true);
    });
    await yieldForPaint();
    try {
      // Call the dynamic step's save method
      if (stepMethods && stepMethods.saveStep) {
        const stepResult: IGRPStepResult = await stepMethods.saveStep();
        if (stepResult.success) {
          const saveResult = await saveTask({
            userTaskInstanceId,
            variables: stepResult.variables,
            forms: stepResult.forms,
          });
          if (saveResult && saveResult.success) {
            igrpToast({
              type: "success",
              title: saveResult.title,
              description: saveResult.message,
            });
          } else {
            igrpToast({
              type: "error",
              title: saveResult.title,
              description: saveResult.message,
            });
          }
        } else {
          igrpToast({
            type: "error",
            title: stepResult.error,
          });
        }
        return stepResult;
      }

      return { success: true, data: undefined };
    } catch (error) {
      console.error("Save error:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Ocorreu um erro desconhecido",
      };
    } finally {
      setIsActionPending(false);
    }
  };

  // Handle complete task action
  const handleCompleteTask = async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    // Defense in depth: even if the buttons are hidden after success, swallow
    // any reentrant call (keyboard shortcut, programmatic dispatch, …) to
    // guarantee the task is submitted at most once per page load.
    if (taskCompleted || isBusy) {
      return { success: false, error: "Já submetido" };
    }
    flushSync(() => {
      setIsActionPending(true);
    });
    await yieldForPaint();
    let succeeded = false;
    try {
      // First, try to call the dynamic step's complete method
      let stepResult: IGRPStepResult = {
        success: false,
        error: "O passo ainda não está pronto",
      };

      if (stepMethods && stepMethods.completeStep) {
        stepResult = await stepMethods.completeStep();
        if (!stepResult.success) {
          setErrorMessage(stepResult.error || "Erro ao concluir o passo");
          setShowErrorDialog(true);
          return stepResult;
        }
      }

      // If step completion is successful, handle BPMN process logic
      if (stepResult.success) {
        const result = await completeTask({
          userTaskInstanceId,
          variables: stepResult.variables,
          forms: stepResult.forms,
          processInstanceId,
          processKey,
          processName: name,
          processNumber: number,
        });
        if (result?.success) {
          // Latch FIRST so the buttons are hidden before the dialog renders,
          // and any in-flight click that races with the response is rejected
          // by the guard above.
          setTaskCompleted(true);
          succeeded = true;
          const summaryHref = resolveSummaryPageHref(
            config?.summaryPage,
            processInstanceId,
          );
          if (summaryHref) {
            goToHref(summaryHref);
            return stepResult;
          }
          setShowSuccessDialog(true);
        } else {
          setErrorMessage(
            `${result?.title ? `${result?.title} - ` : ""}${result?.message}`,
          );
          setShowErrorDialog(true);
        }
      }

      return stepResult;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Ocorreu um erro desconhecido";
      setErrorMessage(errorMsg);
      setShowErrorDialog(true);
      console.error("Complete task error:", error);
      return { success: false, error: errorMsg };
    } finally {
      if (!succeeded) setIsActionPending(false);
    }
  };

  // Index into `displaySteps` (what the stepper renders), not `effectiveSteps`:
  // in consultation the two differ (skipped steps filtered out, renumbered), so
  // using the unfiltered list would select the wrong tab.
  const currentStep = useMemo(() => {
    const key = viewedStepKey;
    return (displaySteps || []).findIndex((step) => step.stepKey === key) + 1;
  }, [displaySteps, viewedStepKey]);

  const handleStepChange = useCallback(
    (_step: number, stepData: { stepKey: string }) => {
      if (!isConsultation) return;
      // Only allow navigation to visited steps (COMPLETED / CURRENT).
      const target = effectiveSteps?.find(
        (s) => s.stepKey === stepData.stepKey,
      );
      if (!target) return;
      if (!target.isCompleted && !target.isActive) return;
      setSelectedStepKey(stepData.stepKey);
    },
    [isConsultation, effectiveSteps, setSelectedStepKey],
  );

  const showActions =
    !isConsultation && statusDesc != "COMPLETED" && !taskCompleted;

  const selectedForm: Form =
    (viewedStepKey && formsByStepKey?.[viewedStepKey]) || form || DEFAULT_FORM;

  const selectedTaskInstanceId =
    (viewedStepKey && taskIdsByStepKey?.[viewedStepKey]) ||
    userTaskInstanceId ||
    "";

  return (
    <div className="flex flex-col gap-6">
      <IGRPPageHeader
        title={name}
        className="py-0"
        iconBackButton={`ArrowLeft`}
        isSticky={true}
        showBackButton={true}
        // Prefer browser history over a hardcoded basepath/my-tasks URL —
        // consultation (and most execution entries) come from another page
        // in the same app (e.g. gestão de evacuações).
        backButtonUseBrowserBack={true}
      >
        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
          <IGRPButton
            variant="ghost"
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="h-9 gap-2"
          >
            <span className="text-sm font-medium">{number}</span>
            {isDetailsOpen ? (
              <IGRPIcon iconName="ChevronUp" />
            ) : (
              <IGRPIcon iconName="ChevronDown" />
            )}
            <span className="sr-only">Alternar detalhes</span>
          </IGRPButton>
          {showActions && (
            <>
              <IGRPButton
                variant="outline"
                onClick={() => {
                  handleSave();
                }}
                iconName="Save"
                showIcon={true}
                loading={isBusy}
                loadingText="A guardar..."
                disabled={isBusy}
              >
                Guardar
              </IGRPButton>
              <IGRPButton
                variant="default"
                onClick={() => {
                  handleCompleteTask();
                }}
                showIcon={true}
                iconName="CircleCheckBig"
                loading={isBusy}
                loadingText="A processar..."
                disabled={isBusy}
              >
                Concluir Tarefa
              </IGRPButton>
            </>
          )}
        </div>
      </IGRPPageHeader>

      <ProcessDetailsCard
        isVisible={isDetailsOpen}
        processInstance={processInstance}
      />

      <IGRPConfirmationDialog
        open={showSuccessDialog}
        onOpenChange={setShowSuccessDialog}
        textHeader="Tarefa completada com sucesso!"
        description="A tarefa foi completada com sucesso!"
        // Only way out is the confirm button — Esc, X and backdrop are no-ops.
        // Prevents the user from staying on the page in a "submitted but not
        // navigated" limbo where the form is still visible.
        dismissable={false}
        labelBtnConfirm="Voltar"
        confirmDelete={async () => {
          setShowSuccessDialog(false);
          handleReturnAfterComplete();
        }}
        isCompleted={true}
      />

      <IGRPConfirmationDialog
        open={showErrorDialog}
        onOpenChange={setShowErrorDialog}
        labelBtnConfirm="Fechar"
        textHeader="Tarefa não completada!"
        description="A tarefa não foi completada devido a erros, por favor verifique os detalhes abaixo e tente novamente!"
        message={errorMessage}
        confirmDelete={async () => {
          setShowErrorDialog(false);
        }}
        isCompleted={false}
      />

      <IGRPStepperProcess
        steps={displaySteps}
        // Suppress the per-step loading spinner once the task is committed.
        // The success dialog (non-dismissable) already conveys "done" — leaving
        // the spinner on while the user reads it makes the step look stuck.
        isLoading={isBusy && !taskCompleted && !isConsultation}
        currentStep={currentStep}
        onStepChange={isConsultation ? handleStepChange : undefined}
      >
        {(currentStepIndex: number) => {
          const stepMeta = (displaySteps || [])[currentStepIndex - 1];
          if (!stepMeta || stepMeta.stepKey !== viewedStepKey) return <></>;

          const stepComponentConfig: IGRPStepComponentConfig = {
            processKey,
            processInstanceId,
            userTaskInstanceId: selectedTaskInstanceId,
            variables,
            processName: name,
            processNumber: number,
            onRegisterMethods: isConsultation
              ? () => undefined
              : handleRegisterMethods,
            readOnly: isConsultation,
          };

          if (!resolveStepComponent) {
            return (
              <Card>
                <CardContent>
                  <div className="flex flex-col items-center justify-center min-h-[120px] p-4 text-amber-600">
                    <p className="text-sm font-medium">
                      resolveStepComponent é obrigatório
                    </p>
                    <p className="text-xs mt-1 text-center">
                      Passe resolveStepComponent ao IGRPProcessProvider (ex.:
                      dynamic import na app com prefixo estático).
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          }

          // Only lock pointer events after a successful submit in execution.
          // Consultation stays interactive (links, expanders, PDF open, …) and
          // relies on `readOnly` on the step config — `pointer-events-none`
          // here used to kill all clicks while the stepper tabs still worked.
          const lockContent =
            (taskCompleted || isActionPending) && !isConsultation;

          return (
            <Card>
              <CardContent
                className={
                  lockContent
                    ? "pointer-events-none select-none opacity-60"
                    : undefined
                }
                aria-disabled={lockContent || isConsultation}
              >
                <StepResolver
                  key={viewedStepKey || "step"}
                  resolve={resolveStepComponent}
                  params={{
                    processKey,
                    version,
                    userTaskKey: viewedStepKey || userTaskKey,
                    processName: name,
                    form: selectedForm,
                  }}
                  config={stepComponentConfig}
                  loadingFallback={
                    <IGRPStepLoading userTaskKey={viewedStepKey || name} />
                  }
                />
              </CardContent>
            </Card>
          );
        }}
      </IGRPStepperProcess>
    </div>
  );
}
export { IGRPProcessPageRenderer };
