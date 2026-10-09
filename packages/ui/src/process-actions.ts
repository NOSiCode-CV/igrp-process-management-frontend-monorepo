"use server";

import type {
  CompleteTaskParams,
  Form,
  IGRPProcessClientConfig,
  IGRPStepConfigParams,
  StepConfigResult,
} from "./types";
import { getIGRPProcessClient } from "./lib/api-client";
import { formFromFormKey } from "./lib/form-key-utils";
import { notifyNextTaskInApp } from "./lib/notify-next-task";
import { resolveProcessInstance } from "./lib/resolve-process-instance";
import {
  type IGRPProcessErrorPayload,
  toProcessErrorPayload,
} from "./lib/process-error";

export async function fetchStepConfig(
  params: IGRPStepConfigParams,
  config: IGRPProcessClientConfig,
): Promise<StepConfigResult> {
  const processManagementClient = await getIGRPProcessClient(config);

  // URL may carry either the instance UUID or the business process number
  // (e.g. MD-2026-1717). Resolve to the canonical instance first.
  const processInstanceData = await resolveProcessInstance(
    processManagementClient,
    params.processInstanceId,
  );
  const processInstanceId = processInstanceData.id;

  const processInstanceTaskStatus =
    await processManagementClient.processes.getProcessInstanceTaskStatus(
      processInstanceId,
    );

  const activityProgress =
    await processManagementClient.activities.getActivityProgress(
      processInstanceId,
      "USER_TASK",
    );

  const activityProgressData = activityProgress.data?.filter(
    (item: any) => item.type === "USER_TASK",
  );

  const userTaskKey =
    processInstanceTaskStatus.data.find(
      (item) => String(item.status) === "CURRENT",
    )?.taskKey ?? null;

  const steps = processInstanceTaskStatus.data.map((item, index) => {
    const status = String(item.status ?? "");
    return {
      step: index + 1,
      title: item.name ?? "",
      description: (item as { description?: string }).description ?? "",
      isCompleted: status === "COMPLETED",
      isActive: status === "CURRENT",
      isSkipped: status === "CREATED",
      stepKey: item.taskKey,
    };
  });

  if (!params.userTaskInstanceId) {
    const formsByStepKey: Record<string, Form> = {};
    const taskIdsByStepKey: Record<string, string> = {};

    try {
      const tasksResponse =
        await processManagementClient.tasks.getTasksByProcessInstance(
          processInstanceId,
          { size: 200 },
        );
      const tasks = tasksResponse.data?.content ?? [];
      for (const task of tasks) {
        if (!task.taskKey) continue;
        if (task.id) {
          taskIdsByStepKey[task.taskKey] = task.id;
        }
        if (task.formKey) {
          formsByStepKey[task.taskKey] = formFromFormKey(task.formKey);
        }
      }
    } catch (error) {
      console.warn("Could not load tasks for consultation form map:", error);
    }

    // Fallback: activityProgress activityInstanceId when task search misses a step
    for (const activity of activityProgressData || []) {
      if (
        activity.activityId &&
        activity.activityInstanceId &&
        !taskIdsByStepKey[activity.activityId]
      ) {
        taskIdsByStepKey[activity.activityId] = activity.activityInstanceId;
      }
    }

    return {
      processInstance: processInstanceData,
      variables: processInstanceData.variables || [],
      userTaskKey,
      steps,
      activityProgress: activityProgressData,
      formsByStepKey,
      taskIdsByStepKey,
    };
  }

  const task = await processManagementClient.tasks.getTaskById(
    params.userTaskInstanceId,
  );

  const form = formFromFormKey(task.data.formKey);

  const variables = [
    ...(task.data.variables || []),
    ...(processInstanceData.variables || []),
    ...[
      {
        name: `${params.userTaskInstanceId}_forms`,
        value: task.data.forms || [],
      },
    ],
  ];

  return {
    task: task.data,
    processInstance: processInstanceData,
    variables,
    userTaskKey,
    steps,
    form,
    activityProgress: activityProgressData,
  };
}

/** Backend TaskDataDTO.forEach NPEs when variables/forms are omitted (Jackson → null). */
function toTaskDataPayload(
  variables?: Array<{ name: string; value: string }>,
  forms?: Array<{ name: string; value: string }>,
) {
  const keep = (item: { name: string; value: string }) =>
    item.value !== "" && item.value !== undefined;
  return {
    variables: (variables ?? []).filter(keep),
    forms: (forms ?? []).filter(keep),
  };
}

export type IGRPFetchStepConfigSafeResult =
  | { ok: true; data: StepConfigResult }
  | { ok: false; error: IGRPProcessErrorPayload };

/**
 * Same as {@link fetchStepConfig} but never throws: failures come back as a
 * serializable payload so the real reason (not found / no access) survives
 * production builds, where Next.js redacts thrown server-action messages.
 */
export async function fetchStepConfigSafe(
  params: IGRPStepConfigParams,
  config: IGRPProcessClientConfig,
): Promise<IGRPFetchStepConfigSafeResult> {
  try {
    return { ok: true, data: await fetchStepConfig(params, config) };
  } catch (error) {
    const payload = toProcessErrorPayload(error);
    if (payload.code === "UNKNOWN") {
      console.error("fetchStepConfig failed:", params.processInstanceId, error);
    }
    return { ok: false, error: payload };
  }
}

export async function callCompleteTask(
  {
    userTaskInstanceId,
    variables,
    forms,
    processInstanceId,
    processKey,
    processName,
    processNumber,
  }: CompleteTaskParams,
  config: IGRPProcessClientConfig,
) {
  try {
    const processManagementClient = await getIGRPProcessClient(config);

    await processManagementClient.tasks.completeTask(
      userTaskInstanceId,
      toTaskDataPayload(variables, forms),
    );

    // Complete already succeeded — IN_APP is best-effort but must run
    // before the server action returns (void work is dropped by Next.js).
    await notifyNextTaskInApp(processManagementClient, {
      completedUserTaskInstanceId: userTaskInstanceId,
      processInstanceId,
      processKey,
      processName,
      processNumber,
    });

    return {
      success: true,
      title: "Tarefa completada com sucesso!",
      message: "Tarefa completada com sucesso!",
    };
  } catch (error: unknown) {
    return handleError(error);
  }
}

export async function callSaveTask(
  {
    userTaskInstanceId,
    variables,
    forms,
  }: {
    userTaskInstanceId: string;
    variables?: Array<{ name: string; value: string }>;
    forms?: Array<{ name: string; value: string }>;
  },
  config: IGRPProcessClientConfig,
) {
  try {
    const processManagementClient = await getIGRPProcessClient(config);

    await processManagementClient.tasks.saveTask(
      userTaskInstanceId,
      toTaskDataPayload(variables, forms),
    );
    return {
      success: true,
      title: "Tarefa",
      message: "Tarefa guardada com sucesso!",
    };
  } catch (error: unknown) {
    return handleError(error);
  }
}

function handleError(error: unknown): {
  success: boolean;
  title: string;
  message: string;
} {
  console.log("call completed with error", error);

  const errorData = parseSaveTaskError(error);
  return {
    success: false,
    title: errorData.title,
    message: errorData.message,
  };
}

/**
 * {"type":"about:blank","title":"Failed to save task. Unable to find task for the given id: cceec5dc-10d3-11f1-a3b8-5efddd07dfd4 for user: a667f627-5602-4ac2-4ac2-1fb6072c71c8 (with groups: [DSIP, DC, GEP, DAAP, GPE, DEPT_IGRP.superadmin, IT, QA, DF, UBUBA, UB, DEPT_IGRP] & with roles: [ACTIVITI_USER, DEPT_IGRP.superadmin, ACTIVITI_ADMIN])","status":500,"instance":"/tasks-instances/231ff9b9-61bd-411e-a0cc-a3c759948149/save"}
 * @param error
 * @returns
 */
const parseSaveTaskError = (
  error: unknown,
): {
  title: string;
  message: string;
} => {
  const details = (error as { details?: string }).details;
  const status = (error as { status?: number }).status;
  if (status === 401) {
    return {
      title: "Não autorizado",
      message: "Não autorizado para completar a tarefa",
    };
  }
  if (!details)
    return {
      title: "Erro",
      message: "Erro desconhecido",
    };
  let errorData: { title?: string; message?: string; instance?: string } = {};
  try {
    errorData = JSON.parse(details);
  } catch {
    return { title: "Erro", message: "Erro desconhecido" };
  }

  const raw = [errorData.title, errorData.message, errorData.instance]
    .filter(Boolean)
    .join(" ");

  if (/getVariables\(\)|Cannot invoke.*List\.forEach/i.test(raw)) {
    return {
      title: "Erro",
      message:
        "Não foi possível concluir a tarefa. Tente novamente. Se o erro persistir, contacte o suporte.",
    };
  }

  const looksTechnical = /cannot invoke|exception|nullpointer|failed to /i.test(
    raw,
  );
  return {
    title: looksTechnical ? "Erro" : errorData.title || "Erro",
    message:
      errorData.message ||
      errorData.instance ||
      "Não foi possível concluir a operação.",
  };
};
