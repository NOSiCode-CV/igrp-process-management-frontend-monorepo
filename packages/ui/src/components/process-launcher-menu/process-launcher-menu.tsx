"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { IGRP_RETURN_URL_PARAM } from "../../lib/task-return-url";
import type { IGRPProcessLauncherMenuProps } from "../../process-launcher-types";
import type {
  IGRPLauncherArea,
  IGRPLauncherProcess,
  IGRPLauncherTaskParams,
} from "../../process-launcher-types";

/**
 * Build the task-execution route for a started task, with the current page as
 * `returnUrl` so the task's "Voltar" lands back here.
 *
 * Segments match the generated runtime route
 * `(generated)/process/[...process]`: processKey / processInstanceId /
 * userTaskKey / userTaskInstanceId.
 */
function buildTaskExecutionPath(task: IGRPLauncherTaskParams): string {
  const path = `/process/${task.processKey}/${task.processInstanceId}/${task.userTaskKey}/${task.userTaskInstanceId}`;
  if (typeof window === "undefined") return path;
  const returnUrl = encodeURIComponent(window.location.href);
  return `${path}?${IGRP_RETURN_URL_PARAM}=${returnUrl}`;
}

/**
 * Header-slot menu that lists the current application's processes and starts
 * them. Mount it in `headerSlots.actions` of a runtime app:
 *
 * ```tsx
 * <IGRPProcessLauncherMenu
 *   appCode={process.env.IGRP_APP_CODE!}
 *   config={{ baseUrl, accessToken }}
 * />
 * ```
 *
 * On click it starts the process (`createAndStartProcess` + claim of the first
 * task) and then **redirects to the task-execution route** — the same pattern
 * as the process-map and the task lists — so the form opens on its own page,
 * with a `returnUrl` back to here. By default it navigates the runtime's own
 * route (`/process/...`, basePath applied by the router); set
 * `processExecutionBaseUrl` to send execution to another origin instead. The
 * process list loads lazily the first time the menu opens.
 */
export function IGRPProcessLauncherMenu({
  appCode,
  config,
  triggerLabel = "Iniciar processo",
  groupByArea = true,
  processExecutionBaseUrl,
  onProcessStarted,
}: IGRPProcessLauncherMenuProps) {
  const { igrpToast } = useIGRPToast();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [areas, setAreas] = useState<IGRPLauncherArea[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  // Name of the process being started → drives the "A iniciar…" busy overlay
  // (we redirect on success, so this stays until the page navigates away).
  const [startingName, setStartingName] = useState<string | null>(null);

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

  const goToTask = useCallback(
    (task: IGRPLauncherTaskParams) => {
      const path = buildTaskExecutionPath(task);
      if (processExecutionBaseUrl) {
        // Another origin/basePath: a hard navigation (the router would apply
        // THIS app's basePath to a foreign URL).
        window.location.assign(`${processExecutionBaseUrl}${path}`);
        return;
      }
      // Same app: client navigation so the router applies NEXT_PUBLIC_BASE_PATH.
      router.push(path as Parameters<typeof router.push>[0]);
    },
    [processExecutionBaseUrl, router],
  );

  const handleStart = useCallback(
    async (process: IGRPLauncherProcess) => {
      setMenuOpen(false);
      setStartingName(process.name);

      const result = await startAppProcess(
        {
          processKey: process.processKey,
          applicationBase: process.applicationBase,
          processDefinitionId: process.releaseId,
        },
        config,
      );

      if (!result.ok) {
        setStartingName(null);
        igrpToast({
          type: "error",
          title: "Não foi possível iniciar",
          description: result.error,
        });
        return;
      }

      onProcessStarted?.({
        processInstanceId: result.processInstanceId,
        processNumber: result.processNumber,
        opened: result.task != null,
      });

      if (result.task) {
        // Keep the overlay up — the redirect unmounts the page.
        goToTask(result.task);
      } else {
        // Started but nothing to open now (async branch / assigned elsewhere).
        setStartingName(null);
        igrpToast({
          type: "success",
          title: "Processo iniciado",
          description: result.processNumber
            ? `Processo nº ${result.processNumber} iniciado.`
            : `${process.name} iniciado.`,
        });
      }
    },
    [config, igrpToast, onProcessStarted, goToTask],
  );

  const hasProcesses = areas.some((a) => a.processes.length > 0);

  return (
    <>
      <IGRPDropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <IGRPDropdownMenuTrigger asChild>
          <IGRPButton variant="outline" size="sm" className="gap-2">
            <IGRPIcon iconName="Workflow" className="size-4" />
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

      {startingName && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm shadow-lg"
        >
          <IGRPLoadingSpinner />
          <span>A iniciar {startingName}…</span>
        </div>
      )}
    </>
  );
}
