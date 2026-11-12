"use client";

import {
  IGRPModalDialog,
  IGRPModalDialogContent,
  IGRPModalDialogHeader,
  IGRPModalDialogTitle,
  IGRPModalDialogDescription,
  IGRPLoadingSpinner,
  IGRPButton,
  IGRPIcon,
} from "@igrp/igrp-framework-react-design-system";
import { IGRPProcessProvider } from "../../igrp-process-context";
import { IGRPProcessPage } from "../../process-page";
import type {
  IGRPProcessClientConfig,
  IGRPResolveStepComponent,
} from "../../types";
import type { IGRPLauncherTaskParams } from "../../process-launcher-types";

interface ProcessLauncherModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolved task to execute. Null while `loading`, or on `error`. */
  params: IGRPLauncherTaskParams | null;
  loading: boolean;
  error: string | null;
  config: IGRPProcessClientConfig;
  resolveStepComponent: IGRPResolveStepComponent;
  /** Process name, shown while the task is still being started. */
  title?: string;
}

/**
 * Hosts the process runtime (`IGRPProcessPage`) in a modal over the app.
 *
 * The page component is page-shaped (own header, navigates on complete), so the
 * provider is given `onExit` → the page closes THIS modal instead of navigating
 * and hides its back button. The modal opens immediately on click and shows a
 * spinner until the start resolves the first task.
 */
export function ProcessLauncherModal({
  open,
  onOpenChange,
  params,
  loading,
  error,
  config,
  resolveStepComponent,
  title,
}: ProcessLauncherModalProps) {
  return (
    <IGRPModalDialog open={open} onOpenChange={onOpenChange}>
      <IGRPModalDialogContent size={`xl`} className="max-w-5xl">
        {/* The page renders its own visible header; keep a sr-only dialog title
            so the modal stays accessible without duplicating the heading. */}
        <IGRPModalDialogHeader className="sr-only">
          <IGRPModalDialogTitle>
            {title ? `Executar processo: ${title}` : "Executar processo"}
          </IGRPModalDialogTitle>
          <IGRPModalDialogDescription>
            Formulário da tarefa inicial do processo.
          </IGRPModalDialogDescription>
        </IGRPModalDialogHeader>

        <div className="max-h-[80vh] overflow-y-auto pr-1">
          {loading && (
            <div className="flex w-full flex-col items-center justify-center gap-3 py-16">
              <IGRPLoadingSpinner />
              <p className="text-sm text-muted-foreground">
                A iniciar {title ?? "o processo"}…
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex w-full flex-col items-center justify-center gap-3 py-16 text-center">
              <IGRPIcon iconName="TriangleAlert" className="text-amber-600" />
              <p className="text-sm font-medium">Não foi possível iniciar</p>
              <p className="max-w-md text-xs text-muted-foreground">{error}</p>
              <IGRPButton variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </IGRPButton>
            </div>
          )}

          {!loading && !error && params && (
            <IGRPProcessProvider
              // Reset the runtime state whenever a new task is opened.
              key={params.userTaskInstanceId}
              params={params}
              config={config}
              resolveStepComponent={resolveStepComponent}
              mode="execution"
              onExit={() => onOpenChange(false)}
            >
              <IGRPProcessPage />
            </IGRPProcessProvider>
          )}
        </div>
      </IGRPModalDialogContent>
    </IGRPModalDialog>
  );
}
