// Extracted from a larger private codebase (CALLIOPE). Source: apps/web/src/lib/api.ts; adapted: standalone API base and local profile type
const API_BASE = "/api/v1";
type GameProfile = Record<string, unknown>;

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidate = record.message ?? record.detail ?? record.title;
    if (Array.isArray(candidate)) {
      return candidate.join(", ");
    }
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return fallback;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method };

  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (cause) {
    throw new ApiError(
      "Unable to reach the local API. Is the server running?",
      0,
      cause,
    );
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      extractMessage(payload, `Request failed with status ${response.status}`),
      response.status,
      payload,
    );
  }

  return payload as T;
}

export const apiGet = <T>(path: string): Promise<T> => request<T>("GET", path);

export const apiPost = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>("POST", path, body);

export const apiPut = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>("PUT", path, body);

export const apiPatch = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>("PATCH", path, body);

/** Paths are relative to API_BASE (`/api/v1`). Never prefix with `/api/v1` again. */
export const gameApi = {
  getProfile: () => apiGet<GameProfile>("/game/profile"),
  getStatus: () => apiGet<Record<string, unknown>>("/game/status"),
  getProgression: () => apiGet<Record<string, unknown>[]>("/game/progression"),
  getAvatar: () => apiGet<Record<string, unknown>>("/game/avatar"),
  getRewards: () => apiGet<Record<string, unknown>[]>("/game/rewards"),
  getSpecializations: () =>
    apiGet<Record<string, unknown>[]>("/game/specializations"),
  selectSpecialization: (id: string) =>
    apiPost<Record<string, unknown>>(`/game/specializations/${id}/select`),
};

export const questsApi = {
  getToday: (localDate?: string) =>
    apiGet<Record<string, unknown>>(
      localDate ? `/quests/today?localDate=${localDate}` : "/quests/today",
    ),
  list: () => apiGet<Record<string, unknown>[]>("/quests"),
  getById: (id: string) => apiGet<Record<string, unknown>>(`/quests/${id}`),
  accept: (id: string) =>
    apiPost<Record<string, unknown>>(`/quests/${id}/accept`),
  abandon: (id: string) =>
    apiPost<Record<string, unknown>>(`/quests/${id}/abandon`),
  selfReflection: (
    id: string,
    body: { spokenSelfRating?: number; notes?: string; completed?: boolean },
  ) => apiPost<Record<string, unknown>>(`/quests/${id}/self-reflection`, body),
};

export const liveTrainingApi = {
  createSessionPack: (
    questInstanceId: string,
    selection?: {
      academicScenarioId?: string;
      lifeScenarioId?: string;
      learnerSituation?: string;
      mode?: "current" | "alternate" | "user";
    },
  ) =>
    apiPost<Record<string, unknown>>("/live/session-packs", {
      questInstanceId,
      ...selection,
    }),
  previewSessionPack: (
    questInstanceId: string,
    selection?: {
      academicScenarioId?: string;
      lifeScenarioId?: string;
      learnerSituation?: string;
      mode?: "current" | "alternate" | "user";
    },
  ) =>
    apiPost<Record<string, unknown>>("/live/session-packs/preview", {
      questInstanceId,
      ...selection,
    }),
  getSessionPack: (id: string) =>
    apiGet<Record<string, unknown>>(`/live/session-packs/${id}`),
  regenerateSessionPack: (id: string) =>
    apiPost<Record<string, unknown>>(`/live/session-packs/${id}/regenerate`),
  markExported: (id: string) =>
    apiPost<Record<string, unknown>>(`/live/session-packs/${id}/mark-exported`),
  validateReport: (rawText: string, sessionPackId?: string) =>
    apiPost<Record<string, unknown>>("/live/reports/validate", {
      rawText,
      sessionPackId,
    }),
  importReport: (rawText: string, sessionPackId?: string) =>
    apiPost<Record<string, unknown>>("/live/reports/import", {
      rawText,
      sessionPackId,
    }),
  confirmReport: (reportId: string, details?: unknown) =>
    apiPost<Record<string, unknown>>(
      `/live/reports/${reportId}/confirm`,
      details,
    ),
  rejectReport: (reportId: string) =>
    apiPost<Record<string, unknown>>(`/live/reports/${reportId}/reject`),
  listProviders: () => apiGet<Record<string, unknown>>("/live/providers"),
};

export const bossesApi = {
  getCurrent: () => apiGet<Record<string, unknown>>("/bosses/current"),
  enter: (id: string) =>
    apiPost<Record<string, unknown>>(`/bosses/${id}/enter`),
};

export const streakApi = {
  get: () => apiGet<Record<string, unknown>>("/streak"),
  updateSettings: (autoUseSeals: boolean) =>
    apiPatch<Record<string, unknown>>("/streak/settings", { autoUseSeals }),
  excuseDay: (localDate: string, reason?: string) =>
    apiPost<Record<string, unknown>>("/streak/excused-day", {
      localDate,
      reason,
    }),
};
