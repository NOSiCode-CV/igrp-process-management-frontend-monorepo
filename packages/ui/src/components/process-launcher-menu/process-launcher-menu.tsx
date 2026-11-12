"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cn,
  useIGRPToast,
  IGRPButton,
  IGRPIcon,
  IGRPLoadingSpinner,
  IGRPDropdownMenu,
  IGRPDropdownMenuTrigger,
  IGRPDropdownMenuContent,
  IGRPDropdownMenuItem,
  IGRPDropdownMenuLabel,
  IGRPDropdownMenuSeparator,
} from "@igrp/igrp-framework-react-design-system";
import {
  listAppProcesses,
  startAppProcess,
} from "../../process-launcher-actions";
import { ProcessLauncherModal } from "./process-launcher-modal";
import type { IGRPProcessLauncherMenuProps } from "../../process-launcher-types";
import type {
  IGRPLauncherArea,
  IGRPLauncherProcess,
  IGRPLauncherTaskParams,
} from "../../process-launcher-types";

interface ModalState {
  open: boolean;
  loading: boolean;
  error: string | null;
  params: IGRPLauncherTaskParams | null;
  title?: string;
}

const CLOSED_MODAL: ModalState = {
  open: false,
  loading: false,
  error: null,
  params: null,
};

/**
 * Header-slot menu that lists the current application's processes and starts
 * them. Mount it in `headerSlots.actions` of a runtime app:
 *
 * ```tsx
 * <IGRPProcessLauncherMenu
 *   appCode={process.env.IGRP_APP_CODE!}
 *   config={{ baseUrl, accessToken }}
 *   resolveStepComponent={resolveStepComponent}
 * />
 * ```
 *
 * On click it starts the process (`createAndStartProcess` + claim of the first
 * task) and opens the task's form in a modal over the app. The process list is
 * loaded lazily the first time the menu opens.
 */
export function IGRPProcessLauncherMenu({
  appCode,
  config,
  resolveStepComponent,
  triggerLabel = "Iniciar processo",
  groupByArea = true,
  onProcessStarted,
}: IGRPProcessLauncherMenuProps) {
  const { igrpToast } = useIGRPToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [areas, setAreas] = useState<IGRPLauncherArea[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [modal, setModal] = useState<ModalState>(CLOSED_MODAL);

  // Lazy-load the process list the first time the menu opens.
  // NB: `loadingList` must NOT be a dependency. It is set inside the effect, so
  // including it would re-run the effect, whose cleanup cancels the in-flight
  // request's closure — leaving `loadingList` stuck `true` forever. Gate on
  // `loaded` only; `loadingList` is pure render state.
  useEffect(() => {
    if (!menuOpen || loaded) return;
    let cancelled = false;
    setLoadingList(true);
    listAppProcesses(appCode, config)
      .then((result) => {
        if (!cancelled) {
          setAreas(result);
          setLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [menuOpen, loaded, appCode, config]);

  const handleStart = useCallback(
    async (process: IGRPLauncherProcess) => {
      setMenuOpen(false);
      setModal({
        open: true,
        loading: true,
        error: null,
        params: null,
        title: process.name,
      });

      const result = await startAppProcess(
        {
          processKey: process.processKey,
          applicationBase: process.applicationBase,
          processDefinitionId: process.releaseId,
        },
        config,
      );

      if (!result.ok) {
        setModal((prev) => ({ ...prev, loading: false, error: result.error }));
        return;
      }

      onProcessStarted?.({
        processInstanceId: result.processInstanceId,
        processNumber: result.processNumber,
        opened: result.task != null,
      });

      if (result.task) {
        setModal((prev) => ({ ...prev, loading: false, params: result.task }));
      } else {
        // Started but nothing to open now (async branch / assigned elsewhere).
        setModal(CLOSED_MODAL);
        igrpToast({
          type: "success",
          title: "Processo iniciado",
          description: result.processNumber
            ? `Processo nº ${result.processNumber} iniciado.`
            : `${process.name} iniciado.`,
        });
      }
    },
    [config, igrpToast, onProcessStarted],
  );

  const hasProcesses = areas.some((a) => a.processes.length > 0);

  return (
    <>
      <IGRPDropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <IGRPDropdownMenuTrigger asChild>
          <IGRPButton variant="outline" size="sm" className="gap-2">
            <IGRPIcon iconName="Play" className="size-4" />
            <span className="hidden sm:inline">{triggerLabel}</span>
          </IGRPButton>
        </IGRPDropdownMenuTrigger>

        <IGRPDropdownMenuContent
          align="end"
          className="w-[min(92vw,40rem)] max-h-[70vh] overflow-y-auto p-2"
        >
          {loadingList && (
            <div className="flex items-center justify-center gap-2 py-8">
              <IGRPLoadingSpinner />
              <span className="text-sm text-muted-foreground">
                A carregar processos…
              </span>
            </div>
          )}

          {!loadingList && !hasProcesses && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">
              Sem processos disponíveis para iniciar.
            </div>
          )}

          {!loadingList &&
            hasProcesses &&
            areas.map((area, index) => (
              <div key={area.id}>
                {index > 0 && <IGRPDropdownMenuSeparator />}
                {groupByArea && (
                  <IGRPDropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                    {area.name}
                  </IGRPDropdownMenuLabel>
                )}
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {area.processes.map((process) => (
                    <IGRPDropdownMenuItem
                      key={process.id}
                      className={cn(
                        "flex cursor-pointer flex-col items-start gap-0.5 rounded-md p-2",
                      )}
                      onSelect={() => handleStart(process)}
                    >
                      <span className="text-sm font-medium leading-tight">
                        {process.name}
                      </span>
                      {process.description && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {process.description}
                        </span>
                      )}
                    </IGRPDropdownMenuItem>
                  ))}
                </div>
              </div>
            ))}
        </IGRPDropdownMenuContent>
      </IGRPDropdownMenu>

      <ProcessLauncherModal
        open={modal.open}
        onOpenChange={(open) => setModal((prev) => ({ ...prev, open }))}
        params={modal.params}
        loading={modal.loading}
        error={modal.error}
        title={modal.title}
        config={config}
        resolveStepComponent={resolveStepComponent}
      />
    </>
  );
}
