"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
 * `returnUrl` so the task's "Voltar" lands back here. Segments match the
 * generated runtime route `(generated)/process/[...process]`:
 * processKey / processInstanceId / userTaskKey / userTaskInstanceId.
 */
function buildTaskExecutionPath(task: IGRPLauncherTaskParams): string {
  const path = `/process/${task.processKey}/${task.processInstanceId}/${task.userTaskKey}/${task.userTaskInstanceId}`;
  if (typeof window === "undefined") return path;
  return `${path}?${IGRP_RETURN_URL_PARAM}=${encodeURIComponent(window.location.href)}`;
}

function matchesQuery(process: IGRPLauncherProcess, q: string): boolean {
  if (!q) return true;
  return (
    process.name.toLowerCase().includes(q) ||
    process.processKey.toLowerCase().includes(q)
  );
}

/**
 * Header-slot menu that lists the current application's processes and starts
 * them. Mount it in `headerSlots.actions` of a runtime app:
 *
 * ```tsx
 * <IGRPProcessLauncherMenu appCode={process.env.IGRP_APP_CODE!} config={{ baseUrl, accessToken }} />
 * ```
 *
 * The menu is a searchable master–detail: areas (grouped by their top-level
 * area) on the left, the selected area's processes on the right. Choosing a
 * process starts it (`createAndStartProcess` + claim) and **redirects to the
 * task-execution route** — same pattern as the process-map and task lists — so
 * the form opens on its own page with a `returnUrl` back to here. Set
 * `processExecutionBaseUrl` to send execution to another origin.
 */
export function IGRPProcessLauncherMenu({
  appCode,
  config,
  triggerLabel = "Iniciar processo",
  processExecutionBaseUrl,
  onProcessStarted,
}: IGRPProcessLauncherMenuProps) {
  const { igrpToast } = useIGRPToast();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [areas, setAreas] = useState<IGRPLauncherArea[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [startingName, setStartingName] = useState<string | null>(null);

  // Lazy-load the process list the first time the menu opens.
  // NB: `loadingList` must NOT be a dependency — it is set inside the effect, so
  // including it would re-run the effect, whose cleanup cancels the in-flight
  // request's closure, leaving `loadingList` stuck `true`. Gate on `loaded`.
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

  const q = query.trim().toLowerCase();

  // Areas with at least one process matching the query (processes filtered too).
  const visibleAreas = useMemo(() => {
    return areas
      .map((area) => ({
        ...area,
        processes: area.processes.filter((p) => matchesQuery(p, q)),
      }))
      .filter((area) => area.processes.length > 0);
  }, [areas, q]);

  const totalVisible = useMemo(
    () => visibleAreas.reduce((n, a) => n + a.processes.length, 0),
    [visibleAreas],
  );

  // Groups that contain real subareas get a section header; a lone top-level
  // area (its name equals its group) is shown as a bare button.
  const groupsWithSub = useMemo(() => {
    const set = new Set<string>();
    for (const a of visibleAreas) {
      if (a.name !== a.groupName) set.add(a.groupName);
    }
    return set;
  }, [visibleAreas]);

  const activeArea =
    visibleAreas.find((a) => a.id === selectedAreaId) ?? visibleAreas[0] ?? null;

  const goToTask = useCallback(
    (task: IGRPLauncherTaskParams) => {
      const path = buildTaskExecutionPath(task);
      if (processExecutionBaseUrl) {
        window.location.assign(`${processExecutionBaseUrl}${path}`);
        return;
      }
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
        goToTask(result.task); // keeps the overlay up; the redirect unmounts us
      } else {
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
  let lastGroup: string | null = null;

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
          className="w-[min(94vw,46rem)] overflow-hidden p-0"
        >
          {loadingList && (
            <div className="flex items-center justify-center gap-2 py-16">
              <IGRPLoadingSpinner />
              <span className="text-sm text-muted-foreground">
                A carregar processos…
              </span>
            </div>
          )}

          {!loadingList && !hasProcesses && (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              Sem processos disponíveis para iniciar.
            </div>
          )}

          {!loadingList && hasProcesses && (
            <div className="flex h-[min(72vh,34rem)] flex-col">
              {/* Search */}
              <div className="border-b p-3">
                <label className="flex h-9 items-center gap-2 rounded-lg border px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
                  <IGRPIcon iconName="Search" className="size-4" />
                  <input
                    aria-label="Procurar processos"
                    placeholder="Procurar por processos…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    // Keep typing in the input — stop Radix's menu typeahead.
                    onKeyDown={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                  />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {totalVisible} processo{totalVisible === 1 ? "" : "s"}
                  </span>
                </label>
              </div>

              {/* Master–detail */}
              <div className="grid min-h-0 flex-1 grid-cols-[13rem_1fr]">
                {/* Areas */}
                <nav
                  aria-label="Áreas"
                  className="grid content-start gap-px overflow-auto border-r bg-muted/30 p-2"
                >
                  {visibleAreas.map((area) => {
                    const showHeader =
                      area.groupName !== lastGroup &&
                      groupsWithSub.has(area.groupName);
                    lastGroup = area.groupName;
                    const selected = activeArea?.id === area.id;
                    return (
                      <div key={area.id}>
                        {showHeader && (
                          <div className="px-2.5 pb-1 pt-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {area.groupName}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedAreaId(area.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium",
                            selected
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {area.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {area.processes.length}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </nav>

                {/* Processes of the selected area */}
                <div className="overflow-auto p-3">
                  {activeArea && (
                    <>
                      <div className="flex items-baseline gap-2 px-1.5 pb-2">
                        <span className="font-semibold">{activeArea.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {activeArea.groupName !== activeArea.name
                            ? `${activeArea.groupName} · `
                            : ""}
                          {activeArea.processes.length} processo
                          {activeArea.processes.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                        {activeArea.processes.map((process) => (
                          <button
                            key={process.id}
                            type="button"
                            onClick={() => handleStart(process)}
                            className="flex items-start gap-2.5 rounded-lg p-2 text-left hover:bg-accent/60"
                          >
                            <IGRPIcon
                              iconName="Workflow"
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            />
                            <span className="grid min-w-0 gap-0.5">
                              <span className="truncate text-[13px] font-semibold leading-tight">
                                {process.name}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {process.processKey}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
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
