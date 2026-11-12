"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

/** A process plus the area it belongs to — used for global search results. */
type ScopedProcess = IGRPLauncherProcess & { areaName: string };

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

function processMatches(process: IGRPLauncherProcess, q: string): boolean {
  if (!q) return true;
  return (
    process.name.toLowerCase().includes(q) ||
    process.processKey.toLowerCase().includes(q)
  );
}

/** Wrap the matched part of `text` in <mark> (case-insensitive, first hit). */
function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-amber-200 px-0.5 text-inherit dark:bg-amber-300/40">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
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
 * Searchable master–detail: areas (grouped by their top-level area) on the left,
 * the selected area's processes on the right. Typing searches ALL areas at once.
 * Choosing a process starts it (`createAndStartProcess` + claim) and **redirects
 * to the task-execution route** so the form opens on its own page with a
 * `returnUrl` back to here. Set `processExecutionBaseUrl` to send execution to
 * another origin.
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
  const searching = q.length > 0;

  const totalProcesses = useMemo(
    () => areas.reduce((n, a) => n + a.processes.length, 0),
    [areas],
  );

  // Match count per area (for the left-nav badges while searching).
  const matchCountByArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of areas) {
      m.set(a.id, a.processes.filter((p) => processMatches(p, q)).length);
    }
    return m;
  }, [areas, q]);

  // Global results across every area, each tagged with its area name.
  const searchResults = useMemo<ScopedProcess[]>(() => {
    if (!searching) return [];
    return areas.flatMap((a) =>
      a.processes
        .filter((p) => processMatches(p, q))
        .map((p) => ({ ...p, areaName: a.name })),
    );
  }, [areas, q, searching]);

  const activeArea =
    areas.find((a) => a.id === selectedAreaId) ?? areas[0] ?? null;

  const hasProcesses = totalProcesses > 0;
  let lastGroup: string | null = null;

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

  const renderProcess = (process: ScopedProcess | IGRPLauncherProcess) => {
    const areaName = "areaName" in process ? process.areaName : null;
    return (
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
            {highlight(process.name, q)}
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {process.processKey}
            {areaName ? ` · ${areaName}` : ""}
          </span>
        </span>
      </button>
    );
  };

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
          {!loadingList && !hasProcesses ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              Sem processos disponíveis para iniciar.
            </div>
          ) : (
            <div className="flex h-[min(72vh,25rem)] flex-col">
              {/* Search */}
              <div className="border-b p-3">
                <label
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg border px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring",
                    searching && searchResults.length === 0 && "border-primary",
                  )}
                >
                  <IGRPIcon iconName="Search" className="size-4" />
                  <input
                    aria-label="Procurar processos"
                    placeholder="Procurar por processos…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                    disabled={loadingList}
                  />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {searching
                      ? `${searchResults.length} resultado${searchResults.length === 1 ? "" : "s"}`
                      : `${totalProcesses} processo${totalProcesses === 1 ? "" : "s"}`}
                  </span>
                </label>
              </div>

              {/* Master–detail */}
              <div className="grid min-h-0 flex-1 grid-cols-[13.75rem_1fr]">
                {/* Areas */}
                <nav
                  aria-label="Áreas"
                  className="grid content-start gap-px overflow-auto border-r bg-muted/30 p-2"
                >
                  {loadingList
                    ? [60, 85, 70, 75, 55].map((w, i) => (
                        <div
                          key={i}
                          className="mx-1.5 my-1 h-6 animate-pulse rounded-md bg-muted"
                          style={{ width: `${w}%` }}
                        />
                      ))
                    : areas.map((area) => {
                        // Always show the group header when the top-level area
                        // changes (matches the design's two-tier left nav).
                        const showHeader = area.groupName !== lastGroup;
                        lastGroup = area.groupName;
                        const count = searching
                          ? (matchCountByArea.get(area.id) ?? 0)
                          : area.processes.length;
                        const dimmed = searching && count === 0;
                        const selected = !searching && activeArea?.id === area.id;
                        return (
                          <Fragment key={area.id}>
                            {showHeader && (
                              <div className="px-2.5 pb-1 pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {area.groupName}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAreaId(area.id);
                                setQuery("");
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]",
                                selected
                                  ? "bg-primary/10 font-semibold text-primary"
                                  : "font-medium hover:bg-accent/60",
                                dimmed && "opacity-45",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {area.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {count}
                              </span>
                            </button>
                          </Fragment>
                        );
                      })}
                </nav>

                {/* Detail */}
                <div className="overflow-auto p-3">
                  {loadingList ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2.5 text-center">
                      <IGRPLoadingSpinner />
                      <span className="text-sm text-muted-foreground">
                        A carregar processos…
                      </span>
                    </div>
                  ) : searching ? (
                    searchResults.length > 0 ? (
                      <>
                        <div className="flex items-baseline gap-2 px-1.5 pb-2">
                          <span className="font-semibold">
                            {searchResults.length} resultado
                            {searchResults.length === 1 ? "" : "s"} para “
                            {query.trim()}”
                          </span>
                          <span className="text-xs text-muted-foreground">
                            em todas as áreas
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-0.5">
                          {searchResults.map(renderProcess)}
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
                        <IGRPIcon
                          iconName="SearchX"
                          className="size-7 text-muted-foreground"
                        />
                        <span className="font-semibold">
                          Nenhum processo encontrado
                        </span>
                        <span className="max-w-xs text-xs text-muted-foreground">
                          Não há processos desta aplicação com “{query.trim()}”.
                          Experimente outro termo ou o código do processo (ex.
                          P1.2.11).
                        </span>
                        <IGRPButton
                          variant="outline"
                          size="sm"
                          onClick={() => setQuery("")}
                          className="mt-1"
                        >
                          Limpar pesquisa
                        </IGRPButton>
                      </div>
                    )
                  ) : (
                    activeArea && (
                      <>
                        <div className="flex items-baseline gap-2 px-1.5 pb-2">
                          <span className="font-semibold">
                            {activeArea.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {activeArea.groupName !== activeArea.name
                              ? `${activeArea.groupName} · `
                              : ""}
                            {activeArea.processes.length} processo
                            {activeArea.processes.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-0.5">
                          {activeArea.processes.map(renderProcess)}
                        </div>
                      </>
                    )
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
