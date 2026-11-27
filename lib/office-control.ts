export const officeControlTimeoutMs = 5 * 60 * 1000;

export type OfficeControlAction =
  | "auto"
  | "hold"
  | "personal"
  | "meeting"
  | "cafe"
  | "restroom"
  | "report"
  | "open_meeting"
  | "summon_bird"
  | "summon_motorcycle"
  | "summon_police_motorcycle";

export type OfficeActorMode = "auto" | "manual";

export type OfficeActorState = {
  actor_user_id: string;
  actor_username: string;
  mode: OfficeActorMode;
  action: OfficeControlAction;
  status: string;
  activity_detail: string;
  zone: string | null;
  expires_at: string | null;
  updated_at: string;
};

export type OfficeActivityEvent = {
  id: number;
  actor_user_id: string;
  actor_username: string;
  action: string;
  status: string;
  activity_detail: string;
  zone: string | null;
  created_at: string;
};

export type OfficeMeetingState = {
  id: number;
  is_active: boolean;
  meeting_expires_at: string | null;
  started_by: string | null;
  updated_at: string;
};

export type OfficeLiveActivity =
  | "walking"
  | "working"
  | "chatting"
  | "eating"
  | "sleeping";

export type OfficeLiveDeliveryTask =
  | "none"
  | "calling"
  | "communication_wait"
  | "outbound"
  | "waiting"
  | "pickup"
  | "returning";

export type OfficeActivityPresence = {
  status: string;
  detail: string;
};

export function getOfficeActivityPresence(input: {
  activity: OfficeLiveActivity;
  deliveryTask: OfficeLiveDeliveryTask;
  isMeetingParticipant: boolean;
  manualControlAction: OfficeControlAction | null;
  reportingToAdmin: boolean;
  zone: string | null;
}): OfficeActivityPresence {
  if (input.isMeetingParticipant) {
    return { status: "in_meeting", detail: "Participating in a team meeting" };
  }
  if (input.reportingToAdmin || input.manualControlAction === "report") {
    return { status: "reporting", detail: "Reporting to the manager" };
  }
  if (input.deliveryTask === "calling") {
    return { status: "calling_shipper", detail: "Calling the courier" };
  }
  if (
    input.deliveryTask === "communication_wait" ||
    input.deliveryTask === "waiting"
  ) {
    return { status: "waiting_for_shipper", detail: "Waiting for the courier" };
  }
  if (input.deliveryTask === "pickup") {
    return { status: "receiving_delivery", detail: "Receiving an online order" };
  }
  if (input.deliveryTask === "returning") {
    return { status: "storing_delivery", detail: "Returning to store the delivery" };
  }
  if (input.manualControlAction === "restroom" || input.zone === "restroom") {
    return { status: "at_restroom", detail: "Using the restroom" };
  }
  if (input.activity === "sleeping") {
    return { status: "sleeping", detail: "Sleeping at the desk" };
  }
  if (input.activity === "eating") {
    return { status: "eating", detail: "Taking a break at the cafe" };
  }
  if (input.activity === "chatting") {
    return { status: "chilling", detail: "Relaxing with colleagues" };
  }
  if (input.activity === "working") {
    return {
      status: "working",
      detail:
        input.zone === "administration" ||
        input.zone === "executive" ||
        input.zone === "documents"
          ? `Working in ${input.zone}`
          : "Working at the desk",
    };
  }
  return {
    status: "walking",
    detail:
      input.zone === "restroom"
        ? "Walking to the restroom"
        : "Walking between work areas",
  };
}

export function getOfficeControlActions(
  username: string | null | undefined,
): OfficeControlAction[] {
  const normalized = username?.trim().toLowerCase();
  if (normalized === "dung0001") {
    return [
      "personal",
      "meeting",
      "open_meeting",
      "cafe",
      "restroom",
      "summon_bird",
      "summon_motorcycle",
      "summon_police_motorcycle",
    ];
  }
  if (
    normalized === "phong0002" ||
    normalized === "truong0003" ||
    normalized === "anh0004"
  ) {
    return ["personal", "meeting", "cafe", "restroom", "report"];
  }
  return [];
}

export function isOfficeMeetingActive(
  meeting: OfficeMeetingState | null,
  now = Date.now(),
): boolean {
  return Boolean(
    meeting?.is_active &&
      meeting.meeting_expires_at &&
      Date.parse(meeting.meeting_expires_at) > now,
  );
}

export function hasOfficeControlExpired(
  state: Pick<OfficeActorState, "mode" | "expires_at">,
  now = Date.now(),
): boolean {
  return Boolean(
    state.mode === "manual" &&
      state.expires_at &&
      Date.parse(state.expires_at) <= now,
  );
}

export function getOfficeControlErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.name === "SupabaseConfigurationError"
  ) {
    return "Supabase public configuration is missing or invalid. Check NEXT_PUBLIC_SUPABASE_URL and the publishable or anon key.";
  }
  if (typeof error !== "object" || error === null) {
    return "Office controls could not connect to Supabase. Check your connection and try again.";
  }

  const candidate = error as { code?: unknown; status?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const status =
    typeof candidate.status === "number" ? candidate.status : undefined;

  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code)) {
    return "Office live-control database setup is missing. Apply supabase/office-realtime.sql in your Supabase project.";
  }
  if (code === "42501") {
    return "Your account cannot access office controls. Verify the active profile and Supabase permissions.";
  }
  if (status === 0 || code === "NETWORK_ERROR") {
    return "Supabase could not be reached. Check the project URL and your network connection.";
  }

  return "Office controls could not connect to Supabase. Check your access and try again.";
}
