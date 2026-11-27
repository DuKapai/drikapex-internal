import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  OfficeActivityEvent,
  OfficeActorState,
  OfficeMeetingState,
} from "@/lib/office-control";
import type { OfficeLiveSnapshot } from "@/lib/office-live";
import { getSafeErrorMessage } from "@/supabase/errors";
import { getSupabaseClient } from "@/supabase/client";

type OfficeSharedState = {
  actorStates: OfficeActorState[];
  activityEvents: OfficeActivityEvent[];
  meeting: OfficeMeetingState | null;
};

export type OfficeApiResult<T> = {
  data: T | null;
  error: string | null;
};

export async function loadOfficeSharedState(): Promise<
  OfficeApiResult<OfficeSharedState>
> {
  try {
    const client = getSupabaseClient();
    const [states, events, meeting] = await Promise.all([
      client
        .from("office_actor_states")
        .select("actor_user_id,actor_username,mode,action,status,activity_detail,zone,expires_at,updated_at")
        .order("updated_at", { ascending: false }),
      client
        .from("office_activity_events")
        .select("id,actor_user_id,actor_username,action,status,activity_detail,zone,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      client
        .from("office_runtime_state")
        .select("id,is_active,meeting_expires_at,started_by,updated_at")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    const error = states.error ?? events.error ?? meeting.error;
    if (error) return { data: null, error: getSafeErrorMessage(error) };
    return {
      data: {
        actorStates: (states.data ?? []) as OfficeActorState[],
        activityEvents: (events.data ?? []) as OfficeActivityEvent[],
        meeting: (meeting.data as OfficeMeetingState | null) ?? null,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: getSafeErrorMessage(error) };
  }
}

function isOfficeActorState(value: unknown): value is OfficeActorState {
  return (
    typeof value === "object" &&
    value !== null &&
    "actor_user_id" in value &&
    "actor_username" in value &&
    "updated_at" in value
  );
}

function isOfficeActivityEvent(value: unknown): value is OfficeActivityEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "actor_user_id" in value &&
    "created_at" in value
  );
}

function isOfficeMeetingState(value: unknown): value is OfficeMeetingState {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "is_active" in value &&
    "updated_at" in value
  );
}

export function subscribeToOfficeSharedState(handlers: {
  userId: string;
  onActorState(state: OfficeActorState): void;
  onActorStateDeleted(userId: string): void;
  onActivityEvent(event: OfficeActivityEvent): void;
  onMeeting(meeting: OfficeMeetingState): void;
  onStatus(status: string): void;
}) {
  const channel = getSupabaseClient()
    .channel(`office-floor-${handlers.userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "office_actor_states" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const row = payload.old;
          if ("actor_user_id" in row && typeof row.actor_user_id === "string") {
            handlers.onActorStateDeleted(row.actor_user_id);
          }
          return;
        }
        if (isOfficeActorState(payload.new)) {
          handlers.onActorState(payload.new);
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "office_activity_events" },
      (payload) => {
        if (isOfficeActivityEvent(payload.new)) {
          handlers.onActivityEvent(payload.new);
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "office_runtime_state",
        filter: "id=eq.1",
      },
      (payload) => {
        if (isOfficeMeetingState(payload.new)) handlers.onMeeting(payload.new);
      },
    )
    .subscribe(handlers.onStatus);
  return {
    unsubscribe: () => getSupabaseClient().removeChannel(channel),
  };
}

export function updateOfficeControls(expire: boolean) {
  return getSupabaseClient().rpc(
    expire ? "expire_office_controls" : "touch_office_actor_control",
  );
}

export function publishOfficeActorStatus(
  status: string,
  zone: string | null,
  activityDetail: string,
) {
  return getSupabaseClient().rpc("publish_office_actor_status", {
    p_status: status,
    p_zone: zone,
    p_activity_detail: activityDetail,
  });
}

export type LiveOfficeHandlers = {
  onPresenceSync(): void;
  onSnapshot(payload: unknown): void;
  onStatus(status: string): void;
  onTrackError(error: unknown): void;
};

export type LiveOfficeConnection = {
  getPresenceClientIds(): string[];
  isJoined(): boolean;
  isConnected(): boolean;
  sendSnapshot(snapshot: OfficeLiveSnapshot): Promise<string>;
  unsubscribe(): Promise<void>;
};

export function connectLiveOffice(
  clientId: string,
  userId: string,
  handlers: LiveOfficeHandlers,
): LiveOfficeConnection {
  const client = getSupabaseClient();
  const channel: RealtimeChannel = client.channel("office-floor-live", {
    config: {
      broadcast: { self: false },
      presence: { key: clientId },
      private: true,
    },
  });
  channel
    .on("presence", { event: "sync" }, handlers.onPresenceSync)
    .on("broadcast", { event: "scene_snapshot" }, ({ payload }) => {
      handlers.onSnapshot(payload);
    })
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") {
        handlers.onStatus(status);
        return;
      }
      void channel.track({ clientId, userId }).then((result) => {
        if (result !== "ok") {
          handlers.onTrackError(
            new Error("Live office position sharing could not register this device."),
          );
          return;
        }
        handlers.onStatus(status);
      }).catch(handlers.onTrackError);
    });

  return {
    getPresenceClientIds: () => Object.keys(channel.presenceState()).sort(),
    isJoined: () => channel.state === "joined",
    isConnected: () => channel.socket.isConnected(),
    sendSnapshot: (snapshot) =>
      channel.send({
        type: "broadcast",
        event: "scene_snapshot",
        payload: snapshot,
      }),
    unsubscribe: async () => {
      await client.removeChannel(channel);
    },
  };
}
