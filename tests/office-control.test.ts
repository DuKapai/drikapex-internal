import { describe, expect, it } from "vitest";
import {
  getOfficeActivityPresence,
  getOfficeControlErrorMessage,
  getOfficeControlActions,
  hasOfficeControlExpired,
  isOfficeMeetingActive,
  officeControlTimeoutMs,
  type OfficeActorState,
  type OfficeMeetingState,
} from "../lib/office-control";

const actorState: OfficeActorState = {
  actor_user_id: "actor-1",
  actor_username: "phong0002",
  mode: "manual",
  action: "personal",
  status: "working",
  activity_detail: "Working in executive",
  zone: "executive",
  expires_at: "2026-11-04T00:05:00.000Z",
  updated_at: "2026-11-04T00:00:00.000Z",
};

describe("virtual-office controls", () => {
  it("limits the meeting host action to dung0001", () => {
    expect(getOfficeControlActions("dung0001")).toContain("open_meeting");
    expect(getOfficeControlActions("DUNG0001")).toContain("open_meeting");
    expect(getOfficeControlActions("dung0001")).toContain("summon_bird");
    expect(getOfficeControlActions("dung0001")).toContain("summon_motorcycle");
    expect(getOfficeControlActions("dung0001")).toContain(
      "summon_police_motorcycle",
    );
    expect(getOfficeControlActions("phong0002")).not.toContain("open_meeting");
    expect(getOfficeControlActions("phong0002")).not.toContain("summon_bird");
  });

  it("derives shared activity states for delivery, meetings, and daily work", () => {
    const base = {
      activity: "walking" as const,
      deliveryTask: "none" as const,
      isMeetingParticipant: false,
      manualControlAction: null,
      reportingToAdmin: false,
      zone: null,
    };

    expect(
      getOfficeActivityPresence({ ...base, deliveryTask: "calling" }),
    ).toEqual({ status: "calling_shipper", detail: "Calling the courier" });
    expect(
      getOfficeActivityPresence({ ...base, deliveryTask: "pickup" }),
    ).toEqual({
      status: "receiving_delivery",
      detail: "Receiving an online order",
    });
    expect(
      getOfficeActivityPresence({ ...base, deliveryTask: "waiting" }),
    ).toEqual({ status: "waiting_for_shipper", detail: "Waiting for the courier" });
    expect(
      getOfficeActivityPresence({ ...base, deliveryTask: "returning" }),
    ).toEqual({
      status: "storing_delivery",
      detail: "Returning to store the delivery",
    });
    expect(
      getOfficeActivityPresence({
        ...base,
        isMeetingParticipant: true,
        activity: "working",
      }),
    ).toEqual({
      status: "in_meeting",
      detail: "Participating in a team meeting",
    });
    expect(
      getOfficeActivityPresence({
        ...base,
        manualControlAction: "restroom",
      }),
    ).toEqual({ status: "at_restroom", detail: "Using the restroom" });
    expect(
      getOfficeActivityPresence({ ...base, activity: "sleeping" }),
    ).toEqual({ status: "sleeping", detail: "Sleeping at the desk" });
    expect(
      getOfficeActivityPresence({ ...base, activity: "chatting" }),
    ).toEqual({ status: "chilling", detail: "Relaxing with colleagues" });
  });

  it("gives other named actors a report option and no host action", () => {
    for (const username of ["phong0002", "truong0003", "anh0004"]) {
      expect(getOfficeControlActions(username)).toContain("report");
      expect(getOfficeControlActions(username)).not.toContain("open_meeting");
    }
    expect(getOfficeControlActions("unknown")).toEqual([]);
  });

  it("uses a five-minute manual-control timeout", () => {
    expect(officeControlTimeoutMs).toBe(300_000);
    expect(
      hasOfficeControlExpired(actorState, Date.parse(actorState.expires_at!) - 1),
    ).toBe(false);
    expect(
      hasOfficeControlExpired(actorState, Date.parse(actorState.expires_at!)),
    ).toBe(true);
    expect(
      hasOfficeControlExpired({ ...actorState, mode: "auto" }, Infinity),
    ).toBe(false);
  });

  it("expires the global meeting at its shared server deadline", () => {
    const meeting: OfficeMeetingState = {
      id: 1,
      is_active: true,
      meeting_expires_at: "2026-11-04T00:05:00.000Z",
      started_by: "actor-1",
      updated_at: "2026-11-04T00:00:00.000Z",
    };
    expect(
      isOfficeMeetingActive(meeting, Date.parse(meeting.meeting_expires_at!) - 1),
    ).toBe(true);
    expect(
      isOfficeMeetingActive(meeting, Date.parse(meeting.meeting_expires_at!)),
    ).toBe(false);
  });

  it("explains how to restore controls when their database API is missing", () => {
    expect(getOfficeControlErrorMessage({ code: "PGRST202" })).toContain(
      "supabase/office-realtime.sql",
    );
    expect(getOfficeControlErrorMessage({ code: "42P01" })).toContain(
      "supabase/office-realtime.sql",
    );
  });

  it("distinguishes permission and network failures", () => {
    expect(getOfficeControlErrorMessage({ code: "42501" })).toContain(
      "permissions",
    );
    expect(getOfficeControlErrorMessage({ code: "NETWORK_ERROR" })).toContain(
      "network connection",
    );
  });
});
