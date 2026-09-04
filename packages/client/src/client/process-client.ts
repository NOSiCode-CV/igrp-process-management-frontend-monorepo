import { BaseApiClient } from "./base-client";
import {
  ApiResponse,
  Process,
  ProcessInstance,
  CreateProcessInstanceRequest,
  CreateAndStartProcessRequest,
  CreateProcessArtifactRequest,
  ProcessArtifact,
  ProcessStats,
  ProcessSequence,
  CreateProcessSequenceRequest,
  PaginatedResponse,
  VariableParams,
  StartProcessInstanceRequest,
  CancelProcessInstanceRequest,
  ProcessDefinitionSchema,
  Priority,
  TaskPriorityRequest,
  ProcessFilter,
  ProcessEventDTO,
  TimerRescheduleDTO,
  ProcessDeploymentRequestDTO,
  ProcessDeploymentDTO,
  ProcessDeploymentListItem,
  ProcessInstanceTaskStatus,
  ConfigParameter,
} from "@igrp/platform-process-management-types";

export class ProcessClient extends BaseApiClient {
  /**
   * GET /process-definitions - Get all process definitions (deployments list)
   */
  async getProcesses(
    params?: ProcessFilter,
  ): Promise<ApiResponse<PaginatedResponse<ProcessDeploymentListItem>>> {
    return this.get<PaginatedResponse<ProcessDeploymentListItem>>(
      "/process-definitions",
      params,
    );
  }

  /**
   * GET /process-definitions/{id} - Get a specific process definition by ID
   */
  async getProcessById(id: string): Promise<ApiResponse<Process>> {
    return this.get<Process>(`/process-definitions/${id}`);
  }

  /**
   * POST /process-definitions/{processDefinitionId}/artifacts - Create a new process artifact
   */
  async createProcessArtifact(
    processDefinitionId: string,
    artifact: CreateProcessArtifactRequest,
  ): Promise<ApiResponse<ProcessArtifact>> {
    return this.post<ProcessArtifact>(
      `/process-definitions/${processDefinitionId}/artifacts`,
      artifact,
    );
  }

  /**
   * POST /process-definitions/{processDefinitionId}/artifacts - Create a new process artifact
   */
  async updateProcessArtifact(
    processDefinitionId: string,
    artifact: CreateProcessArtifactRequest,
  ): Promise<ApiResponse<ProcessArtifact>> {
    const { key, ...rest } = artifact;
    return this.put<ProcessArtifact>(
      `/process-definitions/${processDefinitionId}/artifacts/${key}`,
      rest,
    );
  }

  /**
   * GET /process-definitions/{processDefinitionId}/artifacts - Get artifacts for a process definition
   */
  async getProcessArtifacts(
    processDefinitionId: string,
  ): Promise<ApiResponse<ProcessArtifact[]>> {
    return this.get<ProcessArtifact[]>(
      `/process-definitions/${processDefinitionId}/artifacts`,
    );
  }

  /**
   * GET /process-definitions/{processDefinitionId}/deployed-artifacts - Get deployed artifacts for a process definition
   */
  async getProcessDeployedArtifacts(
    processDefinitionId: string,
  ): Promise<ApiResponse<ProcessArtifact[]>> {
    return this.get<ProcessArtifact[]>(
      `/process-definitions/${processDefinitionId}/deployed-artifacts`,
    );
  }

  /**
   * DELETE /process-definitions/artifacts/{artifactId} - Delete a specific process artifact
   */
  async deleteProcessArtifact(artifactId: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/process-definitions/artifacts/${artifactId}`);
  }

  /**
   * process-definitions/er/assign-groups - Assign groups to a process definition
   */
  async assignGroupsToProcessDefinition(
    processDefinitionId: string,
    candidateGroups: string,
  ): Promise<ApiResponse<void>> {
    return this.post<void>(
      `/process-definitions/${processDefinitionId}/assign`,
      { candidateGroups },
    );
  }

  /**
   * /process-definitions/{id}/unassign- Assign groups to a process definition
   */
  async unassignGroupsToProcessDefinition(
    processDefinitionId: string,
    candidateGroups: string,
  ): Promise<ApiResponse<void>> {
    return this.post<void>(
      `/process-definitions/${processDefinitionId}/unassign`,
      { candidateGroups },
    );
  }

  /**
   * GET /process-instances - Get process instances with optional filters
   */
  async getProcessInstances(
    params?: {
      number?: string;
      name?: string;
      procReleaseKey?: string;
      procReleaseId?: string;
      status?: "CREATED" | "RUNNING" | "SUSPENDED" | "CANCELED" | "COMPLETED";
      applicationBase?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      size?: number;
    },
    body?: {
      variables?: VariableParams;
    },
  ): Promise<ApiResponse<PaginatedResponse<ProcessInstance>>> {
    // Backend requires a request body, so send at least an empty object
    const requestBody = body || {};

    return this.post<PaginatedResponse<ProcessInstance>>(
      "/process-instances/search",
      requestBody,
      params,
    );
  }

  /**
   * GET /process-instances/{id} - Get a specific process instance by ID
   */
  async getProcessInstanceById(
    id: string,
  ): Promise<ApiResponse<ProcessInstance>> {
    return this.get<ProcessInstance>(`/process-instances/${id}`);
  }

  /**
   * POST /process-instances/{id}/cancel - Cancel a running process instance
   */
  async cancelProcessInstance(
    id: string,
    body?: CancelProcessInstanceRequest,
  ): Promise<ApiResponse<ProcessInstance>> {
    return this.post<ProcessInstance>(`/process-instances/${id}/cancel`, body);
  }

  /**
   * GET /process-instances/{id}/task-status - Get task status for a process instance
   */
  async getProcessInstanceTaskStatus(
    id: string,
  ): Promise<ApiResponse<ProcessInstanceTaskStatus[]>> {
    return this.get<ProcessInstanceTaskStatus[]>(
      `/process-instances/${id}/task-status`,
    );
  }

  /**
   * GET /process-instances/status - Get process instances status options
   */
  async getProcessInstancesStatus(): Promise<ApiResponse<ConfigParameter[]>> {
    return this.get<ConfigParameter[]>("/process-instances/status");
  }

  /**
   * GET /process-definitions/{processDefinitionKey}/sequence - Get sequence configuration for a process definition
   */
  async getProcessSequence(
    processDefinitionKey: string,
  ): Promise<ApiResponse<ProcessSequence>> {
    return this.get<ProcessSequence>(
      `/process-definitions/${processDefinitionKey}/sequence`,
    );
  }

  /**
   * POST /process-definitions/{processDefinitionKey}/sequence - Create sequence configuration for a process definition
   */
  async createProcessSequence(
    processDefinitionKey: string,
    sequence: CreateProcessSequenceRequest,
  ): Promise<ApiResponse<ProcessSequence>> {
    return this.post<ProcessSequence>(
      `/process-definitions/${processDefinitionKey}/sequence`,
      sequence,
    );
  }

  /**
   * GET /process-instances/stats - Get process instances statistics
   */
  async getProcessStats(): Promise<ApiResponse<ProcessStats>> {
    return this.get<ProcessStats>("/process-instances/stats");
  }

  /**
   * POST /process-instances - Create and start a new process instance
   */
  async createAndStartProcess(
    body: CreateAndStartProcessRequest,
  ): Promise<ApiResponse<ProcessInstance>> {
    return this.post<ProcessInstance>("/process-instances", body);
  }

  /**
   * POST /process-instances/create - Create a new process instance (without starting)
   */
  async createProcessInstance(
    body: CreateProcessInstanceRequest,
  ): Promise<ApiResponse<ProcessInstance>> {
    return this.post<ProcessInstance>("/process-instances/create", body);
  }

  /**
   * POST /process-instances/{processInstanceId}/start - Start a process instance
   */
  async startProcessInstance(
    processInstanceId: string,
    body: StartProcessInstanceRequest,
  ): Promise<ApiResponse<ProcessInstance>> {
    return this.post<ProcessInstance>(
      `/process-instances/${processInstanceId}/start`,
      body,
    );
  }

  /**
   * DELETE /process-definitions/{id}/archive - Archive a process definition
   */
  async archiveProcessDefinition(id: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/process-definitions/${id}/archive`);
  }

  /**
   * POST /process-definitions/{id}/unarchive - Unarchive a process definition
   */
  async unarchiveProcessDefinition(id: string): Promise<ApiResponse<void>> {
    return this.post<void>(`/process-definitions/${id}/unarchive`);
  }

  /**
   * GET /process-definitions/{id}/export - Export a process definition
   */
  async exportProcessDefinition(
    id: string,
  ): Promise<ApiResponse<ProcessDefinitionSchema>> {
    return this.get<ProcessDefinitionSchema>(
      `/process-definitions/${id}/export`,
    );
  }

  /**
   * GET /process-definitions/{id}/import - Import a process definition
   */
  async importProcessDefinition(
    body: ProcessDefinitionSchema,
  ): Promise<ApiResponse<void>> {
    return this.post<void>(`/process-definitions/import`, body);
  }

  /**
   * DELETE /process-definitions/priorities/{id} - Delete a priority for a process definition
   */
  async deleteProcessDefinitionPriority(
    id: string,
  ): Promise<ApiResponse<void>> {
    return this.delete<void>(`/process-definitions/priorities/${id}`);
  }

  /**
   * GET /process-definitions/{processKey}/priorities - Get all priorities for a process definition
   */
  async getProcessDefinitionPriorities(
    processKey: string,
  ): Promise<ApiResponse<Priority[]>> {
    return this.get<Priority[]>(
      `/process-definitions/${processKey}/priorities`,
    );
  }

  /**
   * PUT /process-definitions/{processKey}/priorities - Create/replace priorities for a process definition
   */
  async createProcessDefinitionPriority(
    processKey: string,
    priority: TaskPriorityRequest[],
  ): Promise<ApiResponse<Priority[]>> {
    return this.put<Priority[]>(
      `/process-definitions/${processKey}/priorities`,
      priority,
    );
  }

  /**
   * POST /process-definitions/deploy - Deploy a process (BPMN XML)
   */
  async deployProcess(
    body: ProcessDeploymentRequestDTO,
  ): Promise<ApiResponse<ProcessDeploymentDTO>> {
    return this.post<ProcessDeploymentDTO>(`/process-definitions/deploy`, body);
  }

  /**
   * POST /process-instances/event - Trigger a process (message) event
   */
  async triggerProcessEvent(body: ProcessEventDTO): Promise<ApiResponse<void>> {
    return this.post<void>(`/process-instances/event`, body);
  }

  /**
   * POST /process-instances/{id}/timer/reschedule - Reschedule a timer
   */
  async rescheduleTimer(
    id: string,
    body: TimerRescheduleDTO,
  ): Promise<ApiResponse<void>> {
    return this.post<void>(`/process-instances/${id}/timer/reschedule`, body);
  }
}
