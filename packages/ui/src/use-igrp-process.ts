"use client";

import { useState, useCallback, useEffect } from "react";
import {
  fetchStepConfigSafe as fetchStepConfigAction,
  callCompleteTask as callCompleteTaskAction,
  callSaveTask as callSaveTaskAction,
} from "./process-actions";
import { resolveFormDataForTask } from "./lib/form-data-fallback";
import { IGRPProcessError, toProcessError } from "./lib/process-error";
import type {
  StepConfigResult,
  IGRPProcessClientConfig,
  StepConfigParams,
  TaskResult,
  SaveTaskParams,
  CompleteTaskParams,
  IGRPGetFormDataForTaskOptions,
  IGRPFormEntry,
} from "./types";
import type { ActivityProgress } from "@igrp/platform-process-management-types";

/**
 * Unified hook for process management operations.
 * Receives params (process/task ids) and config (API baseUrl + accessToken).
 * Config is used internally by fetchStepConfig, completeTask, saveTask and is
 * also exposed so consumers can use it via useIGRPProcessContext().
 */
export function useIGRPProcess(
  params: StepConfigParams,
  config: IGRPProcessClientConfig,
) {
  const { processKey, processInstanceId, userTaskInstanceId, userTaskKey } =
    params;
  // Step config state
  const [stepConfigData, setStepConfigData] = useState<StepConfigResult | null>(
    null,
  );
  // Start as loading: fetch runs in useEffect after the first paint. If this
  // were `false`, IGRPProcessPage would treat `!stepConfig` as an error and
  // flash the fallback before the request begins.
  const [isLoadingStepConfig, setIsLoadingStepConfig] = useState(true);
  const [stepConfigError, setStepConfigError] =
    useState<IGRPProcessError | null>(null);

  // Complete task state
  const [completeTaskResult, setCompleteTaskResult] =
    useState<TaskResult | null>(null);
  const [isLoadingCompleteTask, setIsLoadingCompleteTask] = useState(false);
  const [completeTaskError, setCompleteTaskError] = useState<Error | null>(
    null,
  );

  // Save task state
  const [saveTaskResult, setSaveTaskResult] = useState<TaskResult | null>(null);
  const [isLoadingSaveTask, setIsLoadingSaveTask] = useState(false);
  const [saveTaskError, setSaveTaskError] = useState<Error | null>(null);

  // Fetch step configuration
  const fetchStepConfig = useCallback(async (): Promise<StepConfigResult> => {
    setIsLoadingStepConfig(true);
    setStepConfigError(null);
    try {
      const result = await fetchStepConfigAction(params, config);
      if (!result.ok) throw new IGRPProcessError(result.error);
      setStepConfigData(result.data);
      return result.data;
    } catch (err) {
      // Expected failures arrive as IGRPProcessError; anything else is a
      // transport/redacted throw and becomes UNKNOWN (keeping its digest).
      const error = toProcessError(err);
      setStepConfigError(error);
      throw error;
    } finally {
      setIsLoadingStepConfig(false);
    }
  }, [params, config]);

  // Complete task
  const completeTask = useCallback(
    async (params: CompleteTaskParams): Promise<TaskResult> => {
      setIsLoadingCompleteTask(true);
      setCompleteTaskError(null);
      setCompleteTaskResult(null);
      try {
        const taskResult = await callCompleteTaskAction(params, config);
        setCompleteTaskResult(taskResult);
        return taskResult;
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Não foi possível concluir a tarefa");
        setCompleteTaskError(error);
        throw error;
      } finally {
        setIsLoadingCompleteTask(false);
      }
    },
    [config],
  );

  // Save task
  const saveTask = useCallback(
    async (params: SaveTaskParams): Promise<TaskResult> => {
      setIsLoadingSaveTask(true);
      setSaveTaskError(null);
      setSaveTaskResult(null);
      try {
        const taskResult = await callSaveTaskAction(params, config);
        setSaveTaskResult(taskResult);
        return taskResult;
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Não foi possível guardar a tarefa");
        setSaveTaskError(error);
        throw error;
      } finally {
        setIsLoadingSaveTask(false);
      }
    },
    [config],
  );

  useEffect(() => {
    fetchStepConfig().catch(() => {
      // Error is stored in `stepConfigError`; avoid unhandledRejection.
    });
  }, [fetchStepConfig]);

  const getVariableNameForTask = useCallback(() => {
    return userTaskInstanceId ? `${userTaskInstanceId}_forms` : "";
  }, [userTaskInstanceId]);

  const getVariableForTask = useCallback(
    (variableName: string) => {
      return stepConfigData?.variables?.find(
        (variable: { name: string; value: string }) =>
          variable.name === variableName,
      )?.value;
    },
    [stepConfigData],
  );

  const getFormDataByTaskKey = useCallback(
    (taskKey: string) => {
      const matches = stepConfigData?.activityProgress?.filter(
        (item: ActivityProgress) => item.activityId === taskKey,
      );

      if (!matches?.length) return undefined;

      const latest = matches.reduce(
        (acc: ActivityProgress, current: ActivityProgress) => {
          const accTime = new Date(acc.endTime ?? 0).getTime();
          const currentTime = new Date(current.endTime ?? 0).getTime();

          if (Number.isNaN(accTime) && !Number.isNaN(currentTime))
            return current;
          if (Number.isNaN(currentTime)) return acc;

          return currentTime >= accTime ? current : acc;
        },
      );

      return latest.forms;
    },
    [stepConfigData],
  );

  /**
   * Devolve os dados de form do step actual.
   *
   * Sem args (`getFormDataForTask()`): lê apenas o que o engine tem na
   * variável `${userTaskInstanceId}_forms` do step actual — comportamento
   * legacy.
   *
   * `opts.fallbackToHistory`:
   *   - `true` — quando current está vazio, cai no histórico do mesmo
   *     step (`getFormDataByTaskKey(userTaskKey)`).
   *   - `(variables) => boolean` — predicate que recebe as variáveis
   *     BPMN actuais (`stepConfig.variables`) e decide se activa o
   *     fallback. Permite regras de negócio no consumidor (ex.: só
   *     cair no histórico em ciclos de rectificação) sem precisar de
   *     ir buscar variables ao contexto.
   *
   * A lib não conhece nomes/valores de variáveis de negócio — só faz o
   * mecanismo.
   */
  const getFormDataForTask = useCallback(
    (opts?: IGRPGetFormDataForTaskOptions) => {
      const variableName = getVariableNameForTask();
      const current = getVariableForTask(variableName) as
        | Array<IGRPFormEntry>
        | undefined;

      const variables = (stepConfigData?.variables ??
        []) as Array<IGRPFormEntry>;

      return resolveFormDataForTask(current, opts, variables, () =>
        userTaskKey ? getFormDataByTaskKey(userTaskKey) : current,
      );
    },
    [
      stepConfigData,
      getVariableNameForTask,
      getVariableForTask,
      getFormDataByTaskKey,
      userTaskKey,
    ],
  );

  return {
    // Config (API baseUrl + accessToken) – use for custom API calls or debugging
    config,

    // Process context
    // In consultation, processKey/processInstanceId may come from the URL as a
    // business number; after fetch they are taken from the loaded instance.
    processKey:
      processKey || stepConfigData?.processInstance?.procReleaseKey || "",
    processInstanceId: stepConfigData?.processInstance?.id || processInstanceId,
    userTaskInstanceId,
    userTaskKey,

    // Step config
    stepConfig: stepConfigData,
    isLoadingStepConfig,
    stepConfigError,
    fetchStepConfig,

    // Complete task
    completeTaskResult,
    isLoadingCompleteTask,
    completeTaskError,
    completeTask,

    // Save task
    saveTaskResult,
    isLoadingSaveTask,
    saveTaskError,
    saveTask,

    // Helpers
    getVariableNameForTask,
    getVariableForTask,
    getFormDataForTask,
    getFormDataByTaskKey,

    // Combined loading state
    isLoading:
      isLoadingStepConfig || isLoadingCompleteTask || isLoadingSaveTask,
  };
}
