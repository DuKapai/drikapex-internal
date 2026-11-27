"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import * as THREE from "three";

import type { OfficeMember } from "@/supabase/workspace-api";
import { translateText, useLanguage } from "@/components/language-provider";
import { useWorkspacePresence } from "@/components/workspace-presence";
import {
  findCollisionFreePathLeavingObstacle,
  findUnblockingPath,
  hasMovementProgress,
  isOutsideObstacle,
  moveWithCollisions,
  toLocalOfficeObstacle,
} from "@/lib/office-motion";
import {
  getFlightBoundaryOpacity,
  limitFlightDirectionTurn,
} from "@/lib/office-flight";
import {
  assignMeetingSeats,
  canEnterOfficeZone,
  excludeCurrentOfficeSpot,
  getOfficeSceneMembers,
  getPreferredOfficeZone,
} from "@/lib/office-actor-rules";

import { getDaylightFactor } from "@/lib/office-lighting";
import {
  getInitialTrafficSpawnDelays,
  getRightHandLaneOffset,
  type MotorcycleObstacleState,
} from "@/lib/office-traffic";
import {
  parseOfficeLiveSnapshot,
  type OfficeLiveSnapshot,
} from "@/lib/office-live";
import { clampAnimationDelta, dampAngle } from "@/lib/office-animation";
import { getDueCleaningShift } from "@/lib/office-cleaning";
import {
  getOfficeActivityPresence,
  getOfficeControlActions,
  getOfficeControlErrorMessage,
  isOfficeMeetingActive,
  officeControlTimeoutMs,
  type OfficeActivityEvent,
  type OfficeActorMode,
  type OfficeActorState,
  type OfficeControlAction,
  type OfficeMeetingState,
} from "@/lib/office-control";
import {
  connectLiveOffice,
  loadOfficeSharedState,
  publishOfficeActorStatus,
  subscribeToOfficeSharedState,
  updateOfficeControls,
  type LiveOfficeConnection,
} from "@/supabase/office-api";
import {
  addAutomaticDoor,
  addChair,
  addDesk,
  addInteriorLight,
  addManualRestroomDoor,
  addPlant,
  addRoomLabel,
  addSofa,
  box,
  colorForMember,
  roundedBoxGeometry,
  roundedRectangleGeometry,
  shuffleItems,
  updateRoomLabel,
  zones,
  type ActivitySpot,
  type AutomaticDoor,
  type InteriorLight,
  type OfficeDestination,
  type Workstation,
} from "./interior";
import {
  createActor,
  updateActorAnimation,
  type Actor,
  type ActorActivity,
  type CleaningTool,
} from "./actor";
import {
  addBackgroundBuilding,
  addLandscapePlanter,
  addLandscapeTree,
  addModernStreetlight,
  createBirdFlightRoute,
  createCleaningServiceVehicle,
  createDeliveryShipper,
  createFlyingBird,
  createRoadMotorcycle,
  createRoadVehicle,
  movementSpeedMultiplier,
  moveCleaningServiceVehicle,
  officeDepth,
  officeWidth,
  progressOpacity,
  randomBetween,
  randomBirdPosition,
  randomSummonedBirdApproach,
  updateMotorcycleEmergencyLights,
  updateRoadMotorcycles,
  updateRoadTraffic,
  type ExteriorWall,
  type CleaningServiceVehicle,
} from "./scene-effects";





// [TRA-CUU-VAN-PHONG] Ctrl+F: SO-DO-PHONG, TUONG-TAO, TUONG-NGOAI,
// TUONG-BAO, VACH-NGAN, CUA-TU-DONG, CUA-PHONG, PHONG-VE-SINH, ANH-CHAN-DUNG.
// [SO-DO-PHONG] Trục X là trái/phải, Z là trước/sau (Z dương hướng cửa vào),
// Y là chiều cao. Các vùng bên dưới dùng cho điểm đến, nhãn và chọn phòng;
// chỉ phòng lãnh đạo, hành chính, tài liệu và nhà vệ sinh được dựng vách thật.
// Phòng họp, nhân sự, truyền thông, sảnh chờ, lễ tân và quán cà phê là khu mở.


























type ViewAction = "zoom-in" | "zoom-out" | "rotate-left" | "rotate-right" | "reset";



const officeArea = 150;
const officeScale = Math.sqrt(officeArea / (officeWidth * officeDepth));
const actorCollisionRadius = 0.36;

const cameraMaxTilt = THREE.MathUtils.degToRad(60);
const birdFlightBounds = {
  minX: -78,
  maxX: 78,
  minY: 10,
  maxY: 21,
  minZ: -38,
  maxZ: 14,
};













































// [CUA-TU-DONG] Cửa dùng trục X trái/phải, Z trước/sau, Y chiều cao.
// Cửa hướng ngang trượt cánh theo X; cửa hướng dọc trượt theo Z.
// Ô cửa rộng 1.9, cao 2.325 đơn vị. frameSize đặt trụ, headerSize đặt thanh
// ngang phía trên; leafWidth và hình học tấm kính đặt kích thước cánh di động.




















export default function VirtualOffice({
  members,
  currentUserId,
  memberError,
  onSelect,
}: {
  members: OfficeMember[];
  currentUserId: string;
  memberError: string | null;
  onSelect: (destination: OfficeDestination) => void;
}) {
  const { language } = useLanguage();
  const presence = useWorkspacePresence();
  const currentMember = members.find((member) => member.id === currentUserId);
  const isLocalControlOnlyUser =
    getOfficeControlActions(currentMember?.username).length > 0;
  const [officeActorStates, setOfficeActorStates] = useState<OfficeActorState[]>([]);
  const [officeActivityEvents, setOfficeActivityEvents] = useState<OfficeActivityEvent[]>([]);
  const [officeMeeting, setOfficeMeeting] = useState<OfficeMeetingState | null>(null);
  const [officeDatabaseError, setOfficeDatabaseError] = useState<string | null>(null);
  const [officeActionError, setOfficeActionError] = useState<string | null>(null);
  const [officeRealtimeError, setOfficeRealtimeError] = useState<string | null>(null);
  const [localControlState, setLocalControlState] =
    useState<OfficeActorState | null>(null);
  const [localMeeting, setLocalMeeting] = useState<OfficeMeetingState | null>(
    null,
  );
  const [localControlEvents, setLocalControlEvents] = useState<
    { id: string; detail: string; created_at: string }[]
  >([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [quickControlsOpen, setQuickControlsOpen] = useState(false);
  const [sceneLabelsVisible, setSceneLabelsVisible] = useState(true);
  const [cameraAnchorMode, setCameraAnchorMode] = useState<
    "center" | "actor" | "free"
  >("center");
  const [selectedCameraActor, setSelectedCameraActor] = useState("");
  const [controlClock, setControlClock] = useState(0);
  const t = (text: string) => translateText(text, language);
  const languageRef = useRef(language);
  const officeActorStatesRef = useRef(officeActorStates);
  const officeMeetingRef = useRef(officeMeeting);
  const localControlStateRef = useRef(localControlState);
  const localMeetingRef = useRef(localMeeting);
  const localSceneEffectQueueRef = useRef<OfficeControlAction[]>([]);
  const officeSyncError =
    officeDatabaseError ?? officeActionError ?? officeRealtimeError;
  const lastUserActivityRef = useRef(0);
  const lastPresenceTouchRef = useRef(0);
  useEffect(() => {
    officeActorStatesRef.current = officeActorStates;
    localControlStateRef.current = localControlState;
    localMeetingRef.current = localMeeting;
    officeMeetingRef.current = localMeeting ?? officeMeeting;
  }, [officeActorStates, officeMeeting, localControlState, localMeeting]);

  const createLocalControlState = useCallback((
    action: OfficeControlAction,
    now = Date.now(),
  ): OfficeActorState => {
    const username = currentMember?.username?.trim().toLowerCase() ?? "";
    const mode: OfficeActorMode =
      action === "auto" ||
      action === "summon_bird" ||
      action === "summon_motorcycle" ||
      action === "summon_police_motorcycle"
        ? "auto"
        : "manual";
    const details: Record<OfficeControlAction, string> = {
      auto: "Automatic behavior resumed",
      hold: "Holding position",
      personal: "Working in personal office",
      meeting: "Joining the meeting room",
      cafe: "Taking a break at the cafe",
      restroom: "Going to the restroom",
      report: "Reporting to the manager",
      open_meeting: "Starting a team meeting",
      summon_bird: "Called a bird flyby",
      summon_motorcycle: "Called a regular motorcycle",
      summon_police_motorcycle: "Called a tuned motorcycle with police",
    };
    const statuses: Record<OfficeControlAction, string> = {
      auto: "automatic",
      hold: "manual_hold",
      personal: "working",
      meeting: "in_meeting",
      cafe: "at_cafe",
      restroom: "at_restroom",
      report: "reporting",
      open_meeting: "in_meeting",
      summon_bird: "automatic",
      summon_motorcycle: "automatic",
      summon_police_motorcycle: "automatic",
    };

    const actionZones: Record<OfficeControlAction, string | null> = {
      auto: null,
      hold: null,
      personal:
        username === "dung0001"
          ? "administration"
          : username === "anh0004"
            ? "documents"
            : "executive",
      meeting: "meeting",
      cafe: "cafe",
      restroom: "restroom",
      report: "administration",
      open_meeting: "meeting",
      summon_bird: null,
      summon_motorcycle: null,
      summon_police_motorcycle: null,
    };
    
    return {
      actor_user_id: currentUserId,
      actor_username: username,
      mode,
      action,
      status: statuses[action],
      activity_detail: details[action],
      zone: actionZones[action],
      expires_at:
        mode === "manual"
          ? new Date(now + officeControlTimeoutMs).toISOString()
          : null,
      updated_at: new Date(now).toISOString(),
    };
  }, [currentMember?.username, currentUserId]);
  useEffect(() => {
    const updateClock = () => {
      const now = Date.now();
      setControlClock(now);
      const activeControl = localControlStateRef.current;
      if (
        activeControl?.mode === "manual" &&
        activeControl.expires_at &&
        Date.parse(activeControl.expires_at) <= now
      ) {
        const resumed = createLocalControlState("auto", now);
        localControlStateRef.current = resumed;
        setLocalControlState(resumed);
        setLocalControlEvents((events) =>
          [
            {
              id: resumed.updated_at,
              detail: resumed.activity_detail,
              created_at: resumed.updated_at,
            },
            ...events,
          ].slice(0, 5),
        );
      }
      const activeMeeting = localMeetingRef.current;
      if (
        activeMeeting?.meeting_expires_at &&
        Date.parse(activeMeeting.meeting_expires_at) <= now
      ) {
        localMeetingRef.current = null;
        setLocalMeeting(null);
      }
    };
    const initialUpdate = window.setTimeout(updateClock, 0);
    const interval = window.setInterval(updateClock, 1_000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, [createLocalControlState]);
  const sceneCardRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const zonesRef = useRef<THREE.Mesh[]>([]);
  const actorGroupsRef = useRef<
    { username: string; group: THREE.Group; name: string }[]
  >([]);
  const roomLabelsRef = useRef<THREE.Sprite[]>([]);
  const actorLabelsRef = useRef<THREE.Sprite[]>([]);
  const sceneLabelsVisibleRef = useRef(sceneLabelsVisible);
  const sceneLabelsOpacityRef = useRef(1);
  const sceneLabelsTargetOpacityRef = useRef(1);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const cameraAnchorModeRef = useRef<"center" | "actor" | "free">("center");
  const selectedCameraActorRef = useRef("");
  const manualDoorsRef = useRef<AutomaticDoor[]>([]);
  const pointerRef = useRef(new THREE.Vector2());
  const viewControlRef = useRef<(action: ViewAction) => void>(() => {});
  const suppressClickRef = useRef(false);

  useEffect(() => {
    sceneLabelsVisibleRef.current = sceneLabelsVisible;
    sceneLabelsTargetOpacityRef.current = sceneLabelsVisible ? 1 : 0;
    [...actorLabelsRef.current, ...roomLabelsRef.current].forEach(
      (label) => (label.visible = true),
    );
  }, [sceneLabelsVisible]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const fullscreen = document.fullscreenElement === sceneCardRef.current;
      setIsFullscreen(fullscreen);
      if (!fullscreen) setQuickControlsOpen(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  const toggleFullscreen = async () => {
    const sceneCard = sceneCardRef.current;
    if (!sceneCard) return;
    setFullscreenError(null);
    try {
      if (document.fullscreenElement === sceneCard) {
        await document.exitFullscreen();
      } else {
        await sceneCard.requestFullscreen();
      }
    } catch {
      setFullscreenError(
        t(
          document.fullscreenEnabled
            ? "Could not change fullscreen mode."
            : "Fullscreen is not supported in this browser.",
        ),
      );
    }
  };

  useEffect(() => {
    if (!currentUserId || isLocalControlOnlyUser) return;
    let active = true;
    const loadSharedState = async () => {
      if (!active) return;
      const result = await loadOfficeSharedState();
      if (!active) return;
      if (result.error || !result.data) {
        setOfficeDatabaseError(
          getOfficeControlErrorMessage(result.error ?? "Office data unavailable."),
        );
        return;
      }
      setOfficeActorStates(result.data.actorStates);
      setOfficeActivityEvents(result.data.activityEvents);
      setOfficeMeeting(result.data.meeting);
      setOfficeDatabaseError(null);
    };
    void loadSharedState().catch((cause: unknown) => {
      if (active) {
        setOfficeDatabaseError(getOfficeControlErrorMessage(cause));
      }
    });
    const refreshInterval = window.setInterval(() => {
      void loadSharedState().catch((cause: unknown) => {
        if (active) {
          setOfficeDatabaseError(getOfficeControlErrorMessage(cause));
        }
      });
    }, 30_000);

    let subscription: ReturnType<typeof subscribeToOfficeSharedState>;
    try {
      subscription = subscribeToOfficeSharedState({
        userId: currentUserId,
        onActorStateDeleted: (userId) => {
          setOfficeActorStates((current) =>
            current.filter((state) => state.actor_user_id !== userId),
          );
        },
        onActorState: (state) => {
          setOfficeActorStates((current) => [
            state,
            ...current.filter(
              (existing) => existing.actor_user_id !== state.actor_user_id,
            ),
          ]);
        },
        onActivityEvent: (event) => {
          setOfficeActivityEvents((current) =>
            [event, ...current.filter((item) => item.id !== event.id)].slice(0, 30),
          );
        },
        onMeeting: setOfficeMeeting,
        onStatus: (status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setOfficeRealtimeError(null);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setOfficeRealtimeError("Live office synchronization is unavailable. Check that the office tables are enabled in Supabase Realtime.");
        }
        },
      });
    } catch (cause) {
      queueMicrotask(() =>
        setOfficeRealtimeError(getOfficeControlErrorMessage(cause)),
      );
    }

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      if (subscription) void subscription.unsubscribe();
    };
  }, [currentUserId, isLocalControlOnlyUser]);

  useEffect(() => {
    if (!currentUserId || isLocalControlOnlyUser) return;
    lastUserActivityRef.current = Date.now();
    const registerActivity = () => {
      lastUserActivityRef.current = Date.now();
    };
    const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    activityEvents.forEach((eventName) =>
      document.addEventListener(eventName, registerActivity, { passive: true }),
    );
    const interval = window.setInterval(() => {
      const now = Date.now();
      const hasExpiredControl = officeActorStatesRef.current.some(
        (state) =>
          state.mode === "manual" &&
          state.expires_at !== null &&
          Date.parse(state.expires_at) <= now,
      );
      const meeting = officeMeetingRef.current;
      const meetingExpired = Boolean(
        meeting?.is_active &&
          meeting.meeting_expires_at &&
          Date.parse(meeting.meeting_expires_at) <= now,
      );
      const currentState = officeActorStatesRef.current.find(
        (state) => state.actor_user_id === currentUserId,
      );
      const shouldTouchCurrentControl = Boolean(
        currentState?.mode === "manual" &&
          currentState.expires_at &&
          Date.parse(currentState.expires_at) > now &&
          now - lastUserActivityRef.current < officeControlTimeoutMs &&
          now - lastPresenceTouchRef.current >= 30_000,
      );
      if (!hasExpiredControl && !meetingExpired && !shouldTouchCurrentControl) return;
      void (async () => {
        try {
          const { error: rpcError } = await updateOfficeControls(
            meetingExpired || hasExpiredControl,
          );
          if (rpcError) {
            setOfficeActionError(getOfficeControlErrorMessage(rpcError));
          } else {
            setOfficeActionError(null);
            if (shouldTouchCurrentControl) lastPresenceTouchRef.current = now;
          }
        } catch (cause) {
          setOfficeActionError(getOfficeControlErrorMessage(cause));
        }
      })();
    }, 15_000);
    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((eventName) =>
        document.removeEventListener(eventName, registerActivity),
      );
    };
  }, [currentUserId, isLocalControlOnlyUser]);

  const controlActions = getOfficeControlActions(currentMember?.username);
  const controlLabels: Record<OfficeControlAction, string> = {
    auto: "Resume automatic",
    hold: "Hold position",
    personal: "Go to personal office",
    meeting: "Join meeting",
    cafe: "Visit cafe",
    restroom: "Visit restroom",
    report: "Report to Dung",
    open_meeting: "Start team meeting",
    summon_bird: "Call a bird flyby",
    summon_motorcycle: "Call a regular motorcycle",
    summon_police_motorcycle: "Call a tuned motorcycle with police",
  };
  const statusLabels: Record<string, string> = {
    automatic: "Automatic",
    walking: "Walking",
    working: "Working",
    chatting: "At their desk",
    chilling: "Relaxing",
    eating: "At the cafe",
    sleeping: "Resting",
    calling_shipper: "Calling shipper",
    waiting_for_shipper: "Waiting for shipper",
    receiving_delivery: "Receiving a delivery",
    storing_delivery: "Storing a delivery",
    in_meeting: "In a meeting",
    at_cafe: "At the cafe",
    at_restroom: "At the restroom",
    reporting: "Reporting to Dung",
    manual_hold: "Holding position",
    meeting_started: "Meeting started",
    meeting_ended: "Meeting ended",
  };
  const getOfficeStatusLabel = (status: string) =>
    t(statusLabels[status] ?? status);
  const getRemainingTime = (expiresAt: string) => {
    const seconds = Math.max(
      0,
      Math.ceil((Date.parse(expiresAt) - controlClock) / 1_000),
    );
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const currentActorState = localControlState;
  const effectiveMeeting = localMeeting ?? officeMeeting;
  const sharedMeetingActive = isOfficeMeetingActive(effectiveMeeting);
  const cameraActorOptions = getOfficeSceneMembers(members).filter(
    (member): member is OfficeMember & { username: string } =>
      Boolean(member.username?.trim()),
  );
  const setOfficeCommand = (action: OfficeControlAction) => {
    if (action !== "auto" && !controlActions.includes(action)) return;
    if (
      sharedMeetingActive &&
      action !== "open_meeting" &&
      !action.startsWith("summon_")
    ) {
      return;
    }
    const now = Date.now();
    setOfficeActionError(null);
    setControlClock(now);
    lastUserActivityRef.current = now;
    const nextState = createLocalControlState(action, now);
    const isSceneEffect = action.startsWith("summon_");
    if (isSceneEffect) {
      localSceneEffectQueueRef.current.push(action);
    } else {
      localControlStateRef.current = nextState;
      setLocalControlState(nextState);
    }
    const event = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      detail: nextState.activity_detail,
      created_at: nextState.updated_at,
    };
    setLocalControlEvents((events) => [event, ...events].slice(0, 5));
    if (action === "open_meeting") {
      const meeting: OfficeMeetingState = {
        id: 1,
        is_active: true,
        meeting_expires_at: new Date(now + officeControlTimeoutMs).toISOString(),
        started_by: currentUserId,
        updated_at: nextState.updated_at,
      };
      localMeetingRef.current = meeting;
      officeMeetingRef.current = meeting;
      setLocalMeeting(meeting);
    }
  };
  const openPersonalControls = () => {
    if (document.fullscreenElement === sceneCardRef.current) {
      setQuickControlsOpen((open) => !open);
      return;
    }
    setQuickControlsOpen(true);
    void toggleFullscreen();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const localUsername = members
      .find((member) => member.id === currentUserId)
      ?.username?.trim()
      .toLowerCase();
    const localControlSimulation = isLocalControlOnlyUser;
    host.dataset.webgl = "loading";
    roomLabelsRef.current = [];
    actorLabelsRef.current = [];

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      host.dataset.webgl = "unavailable";
      return;
    }

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color("#e9ece8");
    const daySkyColor = new THREE.Color("#e9ece8");
    const nightSkyColor = new THREE.Color("#27343d");
    const backgroundColor = nightSkyColor.clone();
    const daylightColor = new THREE.Color("#ffffff");
    const daylightGroundColor = new THREE.Color("#afa99b");
    const daylightSunColor = new THREE.Color("#fff5df");
    scene.background = backgroundColor;
    scene.fog = new THREE.Fog(skyColor, 105, 340);
    const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 1500);
    const communicationRugCenter = new THREE.Vector3(0, 0.14, 0);
    const orbitTarget = communicationRugCenter
      .clone()
      .multiplyScalar(officeScale);
    const initialOrbitTarget = orbitTarget.clone();
    const initialCameraZoom = 0.7;
    const initialCameraOffset = new THREE.Vector3(
      16,
      Math.hypot(16, 23),
      23,
    ).multiplyScalar(officeScale);
    const initialCameraSpherical = new THREE.Spherical().setFromVector3(
      initialCameraOffset,
    );
    initialCameraSpherical.phi = cameraMaxTilt;
    const initialCameraPosition = orbitTarget
      .clone()
      .add(new THREE.Vector3().setFromSpherical(initialCameraSpherical));
    const spherical = initialCameraSpherical.clone();
    let targetZoom = initialCameraZoom;
    let targetTheta = spherical.theta;
    let targetPhi = spherical.phi;
    camera.position.copy(initialCameraPosition);
    camera.zoom = initialCameraZoom;
    camera.lookAt(orbitTarget);
    cameraRef.current = camera;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.domElement.setAttribute(
      "aria-label",
      languageRef.current === "vi"
        ? "Mặt bằng văn phòng 3D tương tác"
        : "Interactive 3D office floor plan",
    );
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);
    host.dataset.webgl = "ready";

    const hemisphere = new THREE.HemisphereLight("#ffffff", "#afa99b", 2.35);
    scene.add(hemisphere);
    const sunlight = new THREE.DirectionalLight("#fff5df", 3.15);
    sunlight.position.set(-10, 23, 12).multiplyScalar(officeScale);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(768, 768);
    sunlight.shadow.autoUpdate = false;
    sunlight.shadow.needsUpdate = true;
    sunlight.shadow.camera.left = -15 * officeScale;
    sunlight.shadow.camera.right = 15 * officeScale;
    sunlight.shadow.camera.top = 15 * officeScale;
    sunlight.shadow.camera.bottom = -15 * officeScale;
    sunlight.shadow.bias = -0.0004;
    scene.add(sunlight);

    const exteriorCanvas = document.createElement("canvas");
    exteriorCanvas.width = 512;
    exteriorCanvas.height = 512;
    const exteriorContext = exteriorCanvas.getContext("2d");
    if (exteriorContext) {
      exteriorContext.fillStyle = "#c9cfca";
      exteriorContext.fillRect(0, 0, 512, 512);
      exteriorContext.lineWidth = 1.5;
      for (let row = 0; row < 8; row += 1) {
        for (let column = 0; column < 8; column += 1) {
          exteriorContext.fillStyle =
            (row + column) % 2 ? "rgba(255,255,255,0.035)" : "rgba(71,88,81,0.025)";
          exteriorContext.beginPath();
          exteriorContext.roundRect(
            column * 64 + 3,
            row * 64 + 3,
            58,
            58,
            8,
          );
          exteriorContext.fill();
          exteriorContext.strokeStyle = "rgba(71,88,81,0.1)";
          exteriorContext.beginPath();
          exteriorContext.roundRect(
            column * 64 + 4,
            row * 64 + 4,
            56,
            56,
            7,
          );
          exteriorContext.stroke();
        }
      }
    }
    const exteriorTexture = new THREE.CanvasTexture(exteriorCanvas);
    exteriorTexture.colorSpace = THREE.SRGBColorSpace;
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: "#e1e4df",
      roughness: 0.93,
      map: exteriorTexture,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1800),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.55, 350    );
    ground.receiveShadow = true;
    scene.add(ground);

    const courtyardPlinth = new THREE.Mesh(
      roundedBoxGeometry(officeWidth + 0.68, 0.32, officeDepth + 0.68, 0.22),
      new THREE.MeshStandardMaterial({
        color: "#d9d7cd",
        roughness: 0.78,
      }),
    );
    courtyardPlinth.position.y = -0.205;
    courtyardPlinth.receiveShadow = true;
    scene.add(courtyardPlinth);
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: "#525a59",
      roughness: 0.88,
    });
    const roadMarkingMaterial = new THREE.MeshStandardMaterial({
      color: "#e6e2d4",
      roughness: 0.82,
      transparent: true,
      depthWrite: false,
    });
    const roadY = -0.515;
    const roadCenterZ = 15.8;
    const rearRoadCenterZ = -24;
    const rearBuildingsCenterZ = rearRoadCenterZ - 8;
    const roadLength = 1600;
    const roadHalfLength = roadLength / 2;
    const roadFadeLength = 360;
    const roadFadeSteps = 24;
    const roadFadeSegmentLength = roadFadeLength / roadFadeSteps;
    const roadWidth = 6.2;
    const trafficHalfLength = 90;
    const roadFogStart = trafficHalfLength * 0.62;
    const roadFogBoundary = 80;
    const roadFogEnd = roadFogBoundary;
    const backyardDepth = Math.abs(
      rearRoadCenterZ + roadWidth / 2 + officeDepth / 2,
    );
    const backyard = new THREE.Mesh(
      new THREE.PlaneGeometry(40, backyardDepth),
      new THREE.MeshStandardMaterial({
        color: "#a7b49b",
        roughness: 0.96,
      }),
    );
    backyard.rotation.x = -Math.PI / 2;
    backyard.position.set(
      0,
      -0.535,
      -(officeDepth / 2 + backyardDepth / 2),
    );
    backyard.receiveShadow = true;
    scene.add(backyard);
    const fadeMaterials = Array.from({ length: roadFadeSteps }, (_, index) =>
      new THREE.MeshStandardMaterial({
        color: roadMaterial.color,
        roughness: roadMaterial.roughness,
        transparent: true,
        opacity: (index + 1) / roadFadeSteps,
        depthWrite: false,
      }),
    );
    const markingFadeMaterials = fadeMaterials.map((material) => {
      const fadedMarking = roadMarkingMaterial.clone();
      fadedMarking.opacity = material.opacity;
      return fadedMarking;
    });
    const fadeBandIndex = (distanceFromCenter: number) =>
      THREE.MathUtils.clamp(
        Math.floor(
          ((roadHalfLength - distanceFromCenter) / roadFadeLength) *
            roadFadeSteps,
        ),
        0,
        roadFadeSteps - 1,
      );
    const addFadingStrip = (
      centerZ: number,
      width: number,
      height: number,
      y: number,
      coreMaterial: THREE.Material,
      fadeMaterialsForStrip: THREE.Material[],
    ) => {
      const coreLength = roadLength - roadFadeLength * 2;
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(coreLength, height, width),
        coreMaterial,
      );
      core.position.set(0, y, centerZ);
      core.receiveShadow = true;
      core.frustumCulled = false;
      scene.add(core);
      for (let index = 0; index < roadFadeSteps; index += 1) {
        const segment = new THREE.BoxGeometry(
          roadFadeSegmentLength,
          height,
          width,
        );
        for (const direction of [-1, 1]) {
          const section = new THREE.Mesh(segment, fadeMaterialsForStrip[index]);
          section.position.set(
            direction *
              (roadHalfLength -
                (index + 0.5) * roadFadeSegmentLength),
            y,
            centerZ,
          );
          section.receiveShadow = true;
          section.frustumCulled = false;
          scene.add(section);
        }
      }
    };
    const addRoadSurface = (centerZ: number) =>
      addFadingStrip(
        centerZ,
        roadWidth,
        0.035,
        roadY,
        roadMaterial,
        fadeMaterials,
      );
    const addFadedEdgeMarkings = (centerZ: number) => {
      const segmentLength = 40;
      for (
        let x = -roadHalfLength + segmentLength / 2;
        x < roadHalfLength;
        x += segmentLength
      ) {
        const fadeIndex = fadeBandIndex(Math.abs(x));
        for (const offset of [-2.82, 2.82]) {
          const edge = new THREE.Mesh(
            new THREE.BoxGeometry(segmentLength, 0.012, 0.055),
            markingFadeMaterials[fadeIndex],
          );
          edge.position.set(x, roadY + 0.025, centerZ + offset);
          edge.frustumCulled = false;
          scene.add(edge);
        }
      }
      for (let x = -roadHalfLength + 3; x < roadHalfLength; x += 9.5) {
        const fadeIndex = fadeBandIndex(Math.abs(x));
        const dash = new THREE.Mesh(
          roundedBoxGeometry(3.6, 0.012, 0.07, 0.02),
          markingFadeMaterials[fadeIndex],
        );
        dash.position.set(x, roadY + 0.026, centerZ);
        dash.frustumCulled = false;
        scene.add(dash);
      }
    };
    const roadCenters = [roadCenterZ, rearRoadCenterZ];
    roadCenters.forEach((centerZ) => {
      addRoadSurface(centerZ);
      addFadedEdgeMarkings(centerZ);
    });
    const roadFogMaterials: THREE.MeshBasicMaterial[] = [];
    const roadFogLayers: {
      mesh: THREE.InstancedMesh;
      material: THREE.MeshBasicMaterial;
      basePositions: THREE.Vector3[];
      baseScales: THREE.Vector2[];
      phases: number[];
      driftDirections: number[];
      baseOpacity: number;
    }[] = [];
    const fogCanvas = document.createElement("canvas");
    fogCanvas.width = 256;
    fogCanvas.height = 128;
    const fogContext = fogCanvas.getContext("2d");
    if (!fogContext) {
      throw new Error("Unable to create the road fog texture.");
    }
    const drawFogLobe = (
      x: number,
      y: number,
      radiusX: number,
      radiusY: number,
      opacity: number,
    ) => {
      fogContext.save();
      fogContext.translate(x, y);
      fogContext.scale(radiusX, radiusY);
      const gradient = fogContext.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
      gradient.addColorStop(0.55, `rgba(255,255,255,${opacity * 0.64})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      fogContext.fillStyle = gradient;
      fogContext.fillRect(-1, -1, 2, 2);
      fogContext.restore();
    };
    drawFogLobe(94, 72, 112, 48, 0.7);
    drawFogLobe(58, 60, 54, 38, 0.55);
    drawFogLobe(148, 48, 60, 42, 0.52);
    drawFogLobe(202, 74, 42, 32, 0.48);
    const fogTexture = new THREE.CanvasTexture(fogCanvas);
    fogTexture.colorSpace = THREE.SRGBColorSpace;
    const fogBandCount = 8;
    const fogLateralOffsets = [-8, 0, 8];
    const fogMaterial = new THREE.MeshBasicMaterial({
      color: backgroundColor,
      map: fogTexture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    roadFogMaterials.push(fogMaterial);
    const fogMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      fogMaterial,
      roadCenters.length * 2 * fogBandCount * fogLateralOffsets.length,
    );
    const fogBasePositions: THREE.Vector3[] = [];
    const fogBaseScales: THREE.Vector2[] = [];
    const fogPhases: number[] = [];
    const fogDriftDirections: number[] = [];
    const fogTransform = new THREE.Object3D();
    let fogInstanceIndex = 0;
    for (const centerZ of roadCenters) {
      for (const direction of [-1, 1]) {
        for (let band = 0; band < fogBandCount; band += 1) {
          const progress = (band + 0.5) / fogBandCount;
          const bandCenter =
            roadFogStart + progress * (roadFogEnd - roadFogStart);
          for (const [row, lateralOffset] of fogLateralOffsets.entries()) {
            const phase =
              band * 1.73 +
              row * 2.31 +
              centerZ * 0.11 +
              direction * 0.67;
            const width = 17 + ((band + row) % 3) * 4;
            const height = 4.2 + ((band * 2 + row) % 3) * 1.15;
            const basePosition = new THREE.Vector3(
              direction * bandCenter,
              1.35 + ((band + row) % 3) * 0.82,
              centerZ + lateralOffset,
            );
            fogTransform.position.copy(basePosition);
            fogTransform.rotation.y = Math.PI / 2;
            fogTransform.scale.set(width, height, 1);
            fogTransform.updateMatrix();
            fogMesh.setMatrixAt(fogInstanceIndex, fogTransform.matrix);
            fogBasePositions.push(basePosition);
            fogBaseScales.push(new THREE.Vector2(width, height));
            fogPhases.push(phase);
            fogDriftDirections.push(direction);
            fogInstanceIndex += 1;
          }
        }
      }
    }
    fogMesh.count = fogInstanceIndex;
    fogMesh.instanceMatrix.needsUpdate = true;
    fogMesh.frustumCulled = false;
    scene.add(fogMesh);
    roadFogLayers.push({
      mesh: fogMesh,
      material: fogMaterial,
      basePositions: fogBasePositions,
      baseScales: fogBaseScales,
      phases: fogPhases,
      driftDirections: fogDriftDirections,
      baseOpacity: fogMaterial.opacity,
    });
    const eastboundLaneOffset = getRightHandLaneOffset(1, 1.48);
    const westboundLaneOffset = getRightHandLaneOffset(-1, 1.48);
    const eastboundRoute = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        -roadLength / 2,
        -0.48,
        roadCenterZ + eastboundLaneOffset,
      ),
      new THREE.Vector3(
        roadLength / 2,
        -0.48,
        roadCenterZ + eastboundLaneOffset,
      ),
    ]);
    const westboundRoute = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        roadLength / 2,
        -0.48,
        roadCenterZ + westboundLaneOffset,
      ),
      new THREE.Vector3(
        -roadLength / 2,
        -0.48,
        roadCenterZ + westboundLaneOffset,
      ),
    ]);
    const rearEastboundRoute = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        -roadLength / 2,
        -0.48,
        rearRoadCenterZ + eastboundLaneOffset,
      ),
      new THREE.Vector3(
        roadLength / 2,
        -0.48,
        rearRoadCenterZ + eastboundLaneOffset,
      ),
    ]);
    const rearWestboundRoute = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        roadLength / 2,
        -0.48,
        rearRoadCenterZ + westboundLaneOffset,
      ),
      new THREE.Vector3(
        -roadLength / 2,
        -0.48,
        rearRoadCenterZ + westboundLaneOffset,
      ),
    ]);
    const createTrafficRoute = (
      centerZ: number,
      laneOffset: number,
      direction: 1 | -1,
    ) =>
      new THREE.CatmullRomCurve3(
        direction === 1
          ? [
              new THREE.Vector3(
                -trafficHalfLength,
                -0.48,
                centerZ + laneOffset,
              ),
              new THREE.Vector3(
                trafficHalfLength,
                -0.48,
                centerZ + laneOffset,
              ),
            ]
          : [
              new THREE.Vector3(
                trafficHalfLength,
                -0.48,
                centerZ + laneOffset,
              ),
              new THREE.Vector3(
                -trafficHalfLength,
                -0.48,
                centerZ + laneOffset,
              ),
            ],
      );
    const frontEastboundTraffic = createTrafficRoute(
      roadCenterZ,
      eastboundLaneOffset,
      1,
    );
    const frontWestboundTraffic = createTrafficRoute(
      roadCenterZ,
      westboundLaneOffset,
      -1,
    );
    const rearEastboundTraffic = createTrafficRoute(
      rearRoadCenterZ,
      eastboundLaneOffset,
      1,
    );
    const rearWestboundTraffic = createTrafficRoute(
      rearRoadCenterZ,
      westboundLaneOffset,
      -1,
    );
    const vehicles = [
      createRoadVehicle(
        scene,
        "#9c604a",
        frontEastboundTraffic,
        "eastbound",
        2.25 + Math.random() * 0.65,
        "sedan",
      ),
      createRoadVehicle(
        scene,
        "#d2c4a4",
        frontEastboundTraffic,
        "eastbound",
        2.1 + Math.random() * 0.7,
        "pickup",
      ),
      createRoadVehicle(
        scene,
        "#42635d",
        frontWestboundTraffic,
        "westbound",
        2.2 + Math.random() * 0.65,
        "truck",
      ),
      createRoadVehicle(
        scene,
        "#738b9b",
        frontWestboundTraffic,
        "westbound",
        2.05 + Math.random() * 0.7,
        "sedan",
      ),
      createRoadVehicle(
        scene,
        "#697b84",
        rearEastboundTraffic,
        "rear-eastbound",
        2 + Math.random() * 0.65,
        "pickup",
      ),
      createRoadVehicle(
        scene,
        "#9a7958",
        rearWestboundTraffic,
        "rear-westbound",
        1.95 + Math.random() * 0.65,
        "truck",
      ),
      createRoadVehicle(
        scene,
        "#637a6d",
        rearEastboundTraffic,
        "rear-eastbound",
        2.1 + Math.random() * 0.55,
        "sedan",
      ),
      createRoadVehicle(
        scene,
        "#9a6f68",
        rearWestboundTraffic,
        "rear-westbound",
        2.05 + Math.random() * 0.6,
        "pickup",
      ),
    ];
    const trafficStates = vehicles.map((vehicle) => ({
      laneId: vehicle.laneId,
      progress: vehicle.progress,
      routeLength: vehicle.routeLength,
      speed: vehicle.speed,
      maxSpeed: vehicle.maxSpeed,
      positionX: vehicle.group.position.x,
      positionZ: vehicle.group.position.z,
      active: vehicle.group.visible,
    }));
    const trafficSpeeds = new Array<number>(vehicles.length);
    const initialSpawnDelays = getInitialTrafficSpawnDelays(
      vehicles.map((vehicle) => vehicle.laneId),
    );
    vehicles.forEach((vehicle, index) => {
      vehicle.respawnTime = initialSpawnDelays[index];
    });
    const roadRoutes: { route: THREE.CatmullRomCurve3; laneId: string }[] = [
      { route: eastboundRoute, laneId: "eastbound" },
      { route: westboundRoute, laneId: "westbound" },
      { route: rearEastboundRoute, laneId: "rear-eastbound" },
      { route: rearWestboundRoute, laneId: "rear-westbound" },
    ];
    const motorcycles = roadRoutes.flatMap(({ route, laneId }) =>
      Array.from({ length: 2 }, () =>
        createRoadMotorcycle(scene, route, laneId),
      ),
    );
    const deliveryShipper = createDeliveryShipper(
      scene,
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-22, roadY + 0.035, roadCenterZ - 2.7),
        new THREE.Vector3(-10, roadY + 0.035, roadCenterZ - 2.7),
        new THREE.Vector3(-4, roadY + 0.035, roadCenterZ - 2.9),
        new THREE.Vector3(-1.1, roadY + 0.035, 12.9),
        new THREE.Vector3(0, roadY + 0.035, 11.55),
      ]),
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, roadY + 0.035, 11.55),
        new THREE.Vector3(0, roadY + 0.035, 12.75),
        new THREE.Vector3(2.4, roadY + 0.035, 13.1),
        new THREE.Vector3(12, roadY + 0.035, 13.1),
        new THREE.Vector3(220, roadY + 0.035, 13.1),
        new THREE.Vector3(500, roadY + 0.035, 13.1),
        new THREE.Vector3(roadHalfLength, roadY + 0.035, 13.1),
      ]),
    );
    const cleaningArrivalRoute = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-38, roadY, rearRoadCenterZ),
      new THREE.Vector3(-24, roadY, rearRoadCenterZ),
      new THREE.Vector3(-15, roadY, rearRoadCenterZ + 3),
      new THREE.Vector3(-12.2, roadY, rearRoadCenterZ + 9),
      new THREE.Vector3(-12.5, roadY, -12.2),
      new THREE.Vector3(-12.5, roadY, -9.45),
    ]);
    const cleaningVehicles = [
      createCleaningServiceVehicle(scene, cleaningArrivalRoute, false),
      createCleaningServiceVehicle(scene, cleaningArrivalRoute, true),
    ];
    const shipperObstacleState: MotorcycleObstacleState = {
      positionX: 0,
      positionZ: 0,
      speed: 0,
      active: false,
    };
    updateRoadTraffic(vehicles, trafficStates, trafficSpeeds, 0, 0);
    const roadsideLights = [-60, -35, -10, 15, 40, 65].map((x, index) =>
      addModernStreetlight(
        scene,
        x,
        index % 2 ? roadCenterZ - 4.1 : roadCenterZ + 4.1,
        index % 2 ? 1 : -1,
      ),
    );
    const rearRoadsideLights = [-55, -25, 5, 35, 65].map((x, index) =>
      addModernStreetlight(
        scene,
        x,
        index % 2 ? rearRoadCenterZ - 4.1 : rearRoadCenterZ + 4.1,
        index % 2 ? 1 : -1,
      ),
    );
    const roadsideFixtures = [...roadsideLights, ...rearRoadsideLights];
    const roadsideGreenMaterial = new THREE.MeshStandardMaterial({
      color: "#7b826b",
      roughness: 0.96,
    });
    const roadsideGreenFadeMaterials = fadeMaterials.map((material) => {
      const fadedGreen = roadsideGreenMaterial.clone();
      fadedGreen.opacity = material.opacity;
      fadedGreen.transparent = true;
      fadedGreen.depthWrite = false;
      return fadedGreen;
    });
    for (const centerZ of [roadCenterZ, rearRoadCenterZ]) {
      for (const side of [-1, 1]) {
        const treeLineZ = centerZ + side * 5.2;
        addFadingStrip(
          treeLineZ,
          2.6,
          0.08,
          roadY + 0.025,
          roadsideGreenMaterial,
          roadsideGreenFadeMaterials,
        );
        let index = 0;
        for (let x = -420; x <= 420; x += Math.abs(x) < 132 ? 12 : 24) {
          if (
            centerZ === roadCenterZ &&
            side === -1 &&
            Math.abs(x) <= 12
          ) {
            index += 1;
            continue;
          }
          const tree = addLandscapeTree(
            scene,
            x,
            treeLineZ,
            0.92 + (index % 4) * 0.06,
            ["#587b61", "#66816a", "#54745e", "#6b8266"][index % 4],
          );
          const opacity =
            1 - THREE.MathUtils.smoothstep(Math.abs(x), 180, 400);
          if (opacity < 1) {
            tree.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return;
              const material = object.material as THREE.MeshStandardMaterial;
              material.transparent = true;
              material.depthWrite = false;
              material.opacity = opacity;
            });
          }
          index += 1;
        }
      }
    }
    const nightWindowMaterials: THREE.MeshStandardMaterial[] = [];
    const backgroundBuildings = [
      [-23, 3.8, 5.3, 3.8],
      [-12, 5.4, 4.1, 4.1],
      [0, 4.3, 5.8, 3.8],
      [12, 5, 4.7, 4.2],
      [23, 4, 5.1, 3.7],
    ] as const;
    backgroundBuildings.forEach(([x, width, height, depth]) =>
      addBackgroundBuilding(
        scene,
        x,
        rearBuildingsCenterZ,
        width,
        height,
        depth,
        nightWindowMaterials,
      ),
    );
    const birds = [0, 1].map(() =>
      createFlyingBird(scene, 8.5 + Math.random() * 3.5),
    );
    for (const x of [-9, -6.3, 6.8, 9.5]) {
      addLandscapePlanter(scene, x, 9.1, 2.2, 0.68);
    }
    for (const x of [-9, -6.3, -3.6, -0.9, 1.8, 4.5, 7.2, 9.9]) {
      addLandscapePlanter(scene, x, -9.1, 2.2, 0.68);
    }
    for (const z of [-6.6, -3.3, 0, 3.3, 6.6]) {
      addLandscapePlanter(scene, -11.9, z, 0.7, 1.9);
      addLandscapePlanter(scene, 11.9, z, 0.7, 1.9);
    }

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: "#d5b894",
      roughness: 0.8,
      map: (() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = "#dfc7a6";
          context.fillRect(0, 0, 512, 512);
          for (let row = 0; row < 32; row += 1) {
            const y = row * 16;
            context.fillStyle = row % 2 ? "#d9bd98" : "#e4ceaf";
            context.fillRect(0, y, 512, 15);
            for (let column = 0; column < 4; column += 1) {
              const x = column * 128 + (row % 2 ? 0 : 64);
              context.strokeStyle = "rgba(117,86,54,0.12)";
              context.lineWidth = 1;
              context.strokeRect(x, y, 128, 16);
            }
          }
          for (let i = 0; i < 1800; i += 1) {
            context.fillStyle = `rgba(111,83,56,${Math.random() * 0.055})`;
            context.fillRect(Math.random() * 512, Math.random() * 512, 3, 1);
          }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(officeWidth / 5, officeDepth / 5);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      })(),
    });
    box(
      scene,
      [officeWidth, 0.12, officeDepth],
      [0, 0.025, 0],
      floorMaterial,
      { cast: false },
    );

    const rugMaterial = new THREE.MeshStandardMaterial({
      color: "#8da0a0",
      roughness: 0.96,
    });
    const rugEdgeMaterial = new THREE.MeshStandardMaterial({
      color: "#b7b1a3",
      roughness: 0.94,
    });
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: "#f5f2eb",
      roughness: 0.78,
    });
    const officeWallHeight = 1.4 * 1.5;
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: "#b8d2d6",
      transparent: true,
      opacity: 0.42,
      roughness: 0.18,
      metalness: 0.06,
      transmission: 0.15,
    });
    const exteriorWalls: ExteriorWall[] = [];

    const addRug = (
      x: number,
      z: number,
      width: number,
      depth: number,
      executive = false,
    ) => {
      const edge = executive
        ? new THREE.MeshStandardMaterial({
            color: "#c5a569",
            metalness: 0.28,
            roughness: 0.6,
          })
        : rugEdgeMaterial;
      const textile = executive
        ? new THREE.MeshStandardMaterial({
            color: "#344b42",
            roughness: 0.98,
          })
        : rugMaterial;
      const rugBorder = new THREE.Mesh(
          roundedRectangleGeometry(width + 0.12, depth + 0.12, 0.3),
          edge,
      );
      rugBorder.position.set(x, 0.12, z);
      rugBorder.receiveShadow = true;
      scene.add(rugBorder);
      const rugSurface = new THREE.Mesh(
          roundedRectangleGeometry(width, depth, 0.26),
          textile,
      );
      rugSurface.position.set(x, 0.145, z);
      rugSurface.receiveShadow = true;
      scene.add(rugSurface);
    };
    const activitySpots: ActivitySpot[] = [];
    const workstations: Workstation[] = [];
    const addWorkstation = (
      x: number,
      z: number,
      width = 2,
      depth = 1.05,
      angle = 0,
      executive = false,
    ) => {
      const workstation = addDesk(
        scene,
        x,
        z,
        width,
        depth,
        angle,
        executive,
      );
      if (workstation) workstations.push(workstation);
    };
    let activitySeatNumber = 0;
    const addActivitySeat = (
      activity: ActivitySpot["activity"],
      x: number,
      z: number,
      rotation: number,
      options: Pick<
        ActivitySpot,
        "zoneId" | "requiredUsername" | "meetingChairperson" | "manualOnly"
      > & { executiveChair?: boolean } = {},
    ) => {
      const { executiveChair, ...spotOptions } = options;
      const chair = addChair(
        scene,
        x,
        z,
        rotation,
        executiveChair ? "#3d5147" : "#7e9aa1",
        executiveChair ?? false,
      );
      const resourceId = `seat-${activitySeatNumber++}`;
      const spot = {
        id: `${resourceId}-${activity}`,
        resourceId,
        activity,
        position: new THREE.Vector3(x, 0, z),
        rotation: chair.rotation.y,
        obstacleId: chair.userData.collisionId as string,
        ...spotOptions,
      };
      activitySpots.push(spot);
      if (activity === "working") {
        activitySpots.push({
          ...spot,
          id: `${resourceId}-sleeping`,
          activity: "sleeping",
          position: spot.position.clone(),
        });
      }
    };
    // [TUONG-TAO] addWall nhận kích thước [rộng X, dày Z, cao Y]; x/z là tâm
    // chân tường trên sàn. Chiều cao mặc định officeWallHeight là 2.1 đơn vị.
    // Đổi các tham số ở từng lệnh gọi addWall bên dưới để sửa kích thước/vị trí.
    const addWall = (
      width: number,
      depth: number,
      x: number,
      z: number,
      material = wallMaterial,
      height = officeWallHeight,
    ) => {
      return box(
        scene,
        [width, height, depth],
        [x, 0.12 + height / 2, z],
        material,
        { blocksActors: true },
      );
    };

    // [TUONG-NGOAI] Dùng chung cách đặt kích thước/tâm với addWall; theo dõi
    // riêng để làm mờ tường ngoài đang che hướng nhìn của camera.
    const addExteriorWall = (
      width: number,
      depth: number,
      x: number,
      z: number,
      normal: THREE.Vector3,
    ) => {
      const material = wallMaterial.clone();
      material.transparent = true;
      material.opacity = 1;
      material.depthWrite = false;
      addWall(width, depth, x, z, material, officeWallHeight);
      exteriorWalls.push({ material, normal });
    };

    // [TUONG-BAO] Sàn văn phòng rộng 22 theo X, sâu 16 theo Z, tâm (0,0).
    // Tường bên ở X=+/-11, tường sau ở Z=-8. Tường trước Z=+8 gồm hai đoạn
    // rộng 10.05, chừa giữa 1.9 đơn vị để lắp cửa tự động chính.
    addExteriorWall(
      officeWidth,
      0.24,
      0,
      -officeDepth / 2,
      new THREE.Vector3(0, 0, -1),
    );
    addExteriorWall(
      0.24,
      officeDepth,
      -officeWidth / 2,
      0,
      new THREE.Vector3(-1, 0, 0),
    );
    addExteriorWall(
      0.24,
      officeDepth,
      officeWidth / 2,
      0,
      new THREE.Vector3(1, 0, 0),
    );
    addExteriorWall(
      10.05,
      0.24,
      -5.975,
      officeDepth / 2,
      new THREE.Vector3(0, 0, 1),
    );
    addExteriorWall(
      10.05,
      0.24,
      5.975,
      officeDepth / 2,
      new THREE.Vector3(0, 0, 1),
    );
    // [VACH-NGAN] Vách Z=-3.2 ngăn các phòng phía sau (Z âm) với khu làm việc;
    // khe giữa là cửa phòng họp. Vách X=+/-5.35 tạo ranh giới hành chính/nhân sự.
    // Khu điều hành và văn bản phía tây bỏ vách ngăn giữa, dùng một cửa chung.
    addWall(10.05, 0.16, -5.975, -3.2, wallMaterial);
    addWall(10.05, 0.16, 5.975, -3.2, wallMaterial);
    for (const x of [5.35]) {
      addWall(0.16, 1.95, x, -7.725, wallMaterial);
      addWall(0.16, 1.95, x, -3.875, wallMaterial);
    }
    for (const x of [5.35]) {
      addWall(0.16, 1.175, x, -2.0875, wallMaterial);
      addWall(0.16, 1.175, x, 0.9875, wallMaterial);
      addWall(0.16, 1.25, x, 4.225, wallMaterial);
      addWall(0.16, 1.25, x, 7.375, wallMaterial);
    }
    for (const z of [-2.0875, 0.9875]) {
      addWall(0.16, 1.175, -5.35, z, wallMaterial);
    }
    for (const z of [4.225, 7.375]) {
      addWall(0.16, 1.25, -5.35, z, wallMaterial);
    }
    addWall(0.16, 1.9, -5.35, -0.55, wallMaterial);
    addWall(0.16, 1.9, -5.35, 5.8, wallMaterial);
    // [CUA-PHONG] Khu điều hành và văn bản dùng chung cửa ở (-5.35,2.5875).
    // Các cửa khác phục vụ hành chính, nhân sự-văn hóa, phòng họp và cửa chính.
    const doors = [
      addAutomaticDoor(scene, 5.35, -5.8, "vertical"),
      addAutomaticDoor(scene, -5.35, 2.5875, "vertical"),
      addAutomaticDoor(scene, 5.35, -0.55, "vertical"),
      addAutomaticDoor(scene, 0, -3.2, "horizontal"),
      addAutomaticDoor(scene, 0, 7.94, "horizontal"),
    ];
    // [PHONG-VE-SINH] Cụm WC nam/nữ được thu gọn vào góc trước-bên phải;
    // lối vào bố trí ở mặt sau, hướng về khu văn hóa-café.
    const restroomCenterX = 8.55;
    const restroomCenterZ = 6.45;
    const restroomWidth = 4.4;
    const restroomDepth = 3;
    const restroomLeft = restroomCenterX - restroomWidth / 2;
    const restroomRight = restroomCenterX + restroomWidth / 2;
    const restroomFront = restroomCenterZ + restroomDepth / 2;
    const restroomBack = restroomCenterZ - restroomDepth / 2;
    const restroomRoomCenters = [
      (restroomLeft + restroomCenterX) / 2,
      (restroomCenterX + restroomRight) / 2,
    ];

    addWall(0.14, restroomDepth, restroomLeft, restroomCenterZ, wallMaterial);
    addWall(0.14, restroomDepth, restroomRight, restroomCenterZ, wallMaterial);
    addWall(0.14, restroomDepth, restroomCenterX, restroomCenterZ, wallMaterial);
    const restroomDoorWidth = 0.82;
    const restroomRoomWidth = restroomWidth / 2;
    for (const roomX of restroomRoomCenters) {
      const sideWallWidth = (restroomRoomWidth - restroomDoorWidth) / 2;
      const sideSegmentOffset = restroomDoorWidth / 2 + sideWallWidth / 2;
      addWall(
        sideWallWidth,
        0.14,
        roomX - sideSegmentOffset,
        restroomBack,
        wallMaterial,
      );
      addWall(
        sideWallWidth,
        0.14,
        roomX + sideSegmentOffset,
        restroomBack,
        wallMaterial,
      );
    }
    doors.push(
      addManualRestroomDoor(scene, restroomRoomCenters[0], restroomBack, -1),
      addManualRestroomDoor(scene, restroomRoomCenters[1], restroomBack, 1),
    );
    manualDoorsRef.current = doors.filter((door) => door.manual);

    const restroomFloor = new THREE.Mesh(
      roundedRectangleGeometry(
        restroomWidth - 0.14,
        restroomDepth - 0.14,
        0.16,
      ),
      new THREE.MeshStandardMaterial({ color: "#b8c5c1", roughness: 0.82 }),
    );
    restroomFloor.position.set(restroomCenterX, 0.105, restroomCenterZ);
    scene.add(restroomFloor);
    const porcelain = new THREE.MeshStandardMaterial({
      color: "#f4f3ed",
      roughness: 0.3,
    });
    const restroomMirrorMaterial = new THREE.MeshStandardMaterial({
      color: "#b8cccf",
      metalness: 0.55,
      roughness: 0.2,
    });
    const toiletSeatMaterial = new THREE.MeshStandardMaterial({
      color: "#d8d8d0",
      roughness: 0.35,
    });
    restroomRoomCenters.forEach((roomX, index) => {
      const sinkX = roomX + (index === 0 ? -0.55 : 0.55);
      const basin = new THREE.Mesh(
        roundedBoxGeometry(0.68, 0.16, 0.44, 0.1),
        porcelain,
      );
      basin.position.set(sinkX, 0.82, restroomFront - 0.62);
      basin.userData.blocksActors = true;
      scene.add(basin);
      const sinkPedestal = new THREE.Mesh(
        roundedBoxGeometry(0.22, 0.64, 0.22, 0.08),
        porcelain,
      );
      sinkPedestal.position.set(sinkX, 0.43, restroomFront - 0.62);
      sinkPedestal.userData.blocksActors = true;
      scene.add(sinkPedestal);
      const mirror = new THREE.Mesh(
        roundedBoxGeometry(0.035, 0.76, 0.62, 0.06),
        restroomMirrorMaterial,
      );
      mirror.position.set(
        index === 0 ? restroomLeft + 0.12 : restroomRight - 0.12,
        1.42,
        restroomFront - 0.62,
      );
      scene.add(mirror);

      const toiletX = roomX;
      const toiletZ = restroomBack + 0.72;
      const toiletBase = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 10),
        porcelain,
      );
      toiletBase.scale.set(1, 0.62, 1.14);
      toiletBase.position.set(toiletX, 0.36, toiletZ);
      toiletBase.userData.blocksActors = true;
      scene.add(toiletBase);
      const toiletSeat = new THREE.Mesh(
        new THREE.TorusGeometry(0.25, 0.04, 8, 20),
        toiletSeatMaterial,
      );
      toiletSeat.rotation.x = Math.PI / 2;
      toiletSeat.scale.set(1, 1.14, 1);
      toiletSeat.position.set(toiletX, 0.56, toiletZ);
      toiletSeat.userData.blocksActors = true;
      scene.add(toiletSeat);
      const toiletTank = new THREE.Mesh(
        roundedBoxGeometry(0.52, 0.6, 0.2, 0.08),
        porcelain,
      );
      toiletTank.position.set(toiletX, 0.7, toiletZ - 0.5);
      toiletTank.userData.blocksActors = true;
      scene.add(toiletTank);
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: "#4b504d",
      roughness: 0.5,
      metalness: 0.22,
    });
    for (const x of [-9.95, -7.65, -5.55, 5.55, 7.65, 9.95]) {
      box(scene, [0.09, 1.06, 0.08], [x, 0.83, -8], frameMaterial);
    }
    box(scene, [4.5, 0.08, 0.08], [-7.65, 1.36, -8], frameMaterial);
    box(scene, [4.5, 0.08, 0.08], [7.65, 1.36, -8], frameMaterial);
    box(scene, [0.08, 0.95, 0.05], [0, 0.74, -7.89], glassMaterial, {
      cast: false,
    }    );
    const entranceCanopyMaterial = new THREE.MeshStandardMaterial({
      color: "#3d544c",
      roughness: 0.42,
      metalness: 0.34,
    });
    box(
      scene,
      [3.2, 0.16, 1.15],
      [0, 2.42, 8.18],
      entranceCanopyMaterial,
      { cast: true },
    );
    for (const x of [-1.42, 1.42]) {
      box(
        scene,
        [0.09, 2.5, 0.09],
        [x, 1.25, 8.18],
        entranceCanopyMaterial,
      );
    }
    const entranceStepMaterial = new THREE.MeshStandardMaterial({
      color: "#cfcbbc",
      roughness: 0.82,
    });
    box(
      scene,
      [3.35, 0.12, 1.2],
      [0, -0.11, 8.48],
      entranceStepMaterial,
      { cast: false },
    );
    box(
      scene,
      [2.5, 0.06, 3.05],
      [0, -0.51, 10.55],
      entranceStepMaterial,
      { cast: false },
    );
    const entranceWalkwayMaterial = new THREE.MeshStandardMaterial({
      color: "#b9b6aa",
      roughness: 0.48,
      metalness: 0.12,
    });
    box(
      scene,
      [4.2, 0.08, 3.9],
      [0, -0.44, 11.02],
      entranceWalkwayMaterial,
      { cast: false },
    );
    const walkwayInlayMaterial = new THREE.MeshStandardMaterial({
      color: "#c5a569",
      metalness: 0.68,
      roughness: 0.3,
      emissive: "#604b25",
      emissiveIntensity: 0.16,
    });
    for (const x of [-1.98, 1.98]) {
      box(
        scene,
        [0.035, 0.012, 3.72],
        [x, -0.394, 11.02],
        walkwayInlayMaterial,
        { cast: false },
      );
    }
    const bollardBody = new THREE.MeshStandardMaterial({
      color: "#33443e",
      metalness: 0.66,
      roughness: 0.32,
    });
    const bollardLight = new THREE.MeshStandardMaterial({
      color: "#fff0c7",
      emissive: "#ffc86b",
      emissiveIntensity: 1.15,
      roughness: 0.25,
    });
    for (const x of [-2.45, 2.45]) {
      for (const z of [9.78, 11.82]) {
        const bollard = new THREE.Group();
        bollard.position.set(x, -0.4, z);
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.16, 0.34, 12),
          bollardBody,
        );
        base.position.y = 0.17;
        bollard.add(base);
        const diffuser = new THREE.Mesh(
          new THREE.CylinderGeometry(0.125, 0.125, 0.08, 12),
          bollardLight,
        );
        diffuser.position.y = 0.36;
        bollard.add(diffuser);
        scene.add(bollard);
      }
    }
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 512;
    signCanvas.height = 180;
    const signContext = signCanvas.getContext("2d");
    const drawSignArtwork = (logo?: HTMLImageElement) => {
      if (!signContext) return;
      signContext.fillStyle = "#193b36";
      signContext.fillRect(0, 0, signCanvas.width, signCanvas.height);
      if (logo?.complete && logo.naturalWidth > 0) {
        signContext.drawImage(logo, 14, 14, 152, 152);
        const logoPixels = signContext.getImageData(14, 14, 152, 152);
        const background = logoPixels.data.slice(0, 3);
        const signBackground: [number, number, number] = [25, 59, 54];
        for (let index = 0; index < logoPixels.data.length; index += 4) {
          const colorDistance = Math.max(
            Math.abs(logoPixels.data[index] - background[0]),
            Math.abs(logoPixels.data[index + 1] - background[1]),
            Math.abs(logoPixels.data[index + 2] - background[2]),
          );
          const logoWeight = THREE.MathUtils.clamp(
            (colorDistance - 36) / 60,
            0,
            1,
          );
          for (let channel = 0; channel < 3; channel += 1) {
            logoPixels.data[index + channel] =
              signBackground[channel] +
              (logoPixels.data[index + channel] - signBackground[channel]) *
                logoWeight;
          }
          if (colorDistance <= 36) {
            logoPixels.data[index + 3] = 255;
          }
        }
        signContext.putImageData(logoPixels, 14, 14);
      }
      signContext.fillStyle = "#f4ead7";
      signContext.textAlign = "left";
      signContext.shadowColor = "#ffd98a";
      signContext.shadowBlur = 12;
      signContext.font = "600 28px Arial, sans-serif";
      signContext.fillText("DRIKAPEX GROUP", 190, 78);
      signContext.shadowBlur = 8;
      signContext.fillStyle = "#fff0c8";
      signContext.font = "500 19px Arial, sans-serif";
      signContext.fillText("VIRTUAL OFFICE", 190, 114);
      signContext.shadowBlur = 0;
    };
    const logoImage = new Image();
    logoImage.onload = () => {
      drawSignArtwork(logoImage);
      signTexture.needsUpdate = true;
    };
    drawSignArtwork();
    logoImage.src = "/office.png";
    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    const signFrameMaterial = new THREE.MeshStandardMaterial({
      color: "#193b36",
      metalness: 0.08,
      roughness: 0.48,
    });
    box(
      scene,
      [3.18, 1.1, 0.15],
      [0, 3.05, 8.24],
      signFrameMaterial,
    );
    const entranceSignMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: signTexture,
      emissive: "#ffe0a6",
      emissiveMap: signTexture,
      emissiveIntensity: 0.28,
      metalness: 0.08,
      roughness: 0.48,
      side: THREE.DoubleSide,
    });
    const entranceSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.94, 1.04),
      entranceSignMaterial,
    );
    entranceSign.position.set(0, 3.05, 8.33);
    entranceSign.castShadow = false;
    scene.add(entranceSign);
    const entranceSignGlow = new THREE.PointLight("#edc27a", 0, 6, 2);
    entranceSignGlow.position.set(0, 3.05, 8.68);
    scene.add(entranceSignGlow);

    for (const zone of zones) {
      const material = new THREE.MeshStandardMaterial({
        color: zone.color,
        transparent: true,
        opacity: 0.42,
        roughness: 0.9,
        depthWrite: false,
      });
      const footprint = new THREE.Mesh(
        roundedRectangleGeometry(zone.width, zone.depth, 0.32),
        material,
      );
      footprint.position.set(zone.x, 0.12, zone.z);
      footprint.userData.destination = zone.destination;
      footprint.userData.zoneId = zone.id;
      footprint.receiveShadow = true;
      scene.add(footprint);
      zonesRef.current.push(footprint);
    }

    addRug(-2.55, -5.8, 14.7, 3.6);
    addRug(-8.15, 2.05, 3.25, 9.8);
    addRug(8.1, -5.65, 4.2, 3.3, true);
    addRug(8.15, 0.65, 5, 6.8);
    addRug(-3.25, 6.15, 4.6, 2.6);
    addRug(4.25, 6.1, 4.8, 2.5);
    const communicationRug = new THREE.Group();
    communicationRug.position.copy(communicationRugCenter);
    const ovalRugBase = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshStandardMaterial({
        color: "#31534a",
        roughness: 0.96,
      }),
    );
    ovalRugBase.rotation.x = -Math.PI / 2;
    ovalRugBase.scale.set(4.25, 2.15, 1);
    ovalRugBase.receiveShadow = true;
    communicationRug.add(ovalRugBase);
    const ovalRugBorder = new THREE.Mesh(
      new THREE.RingGeometry(0.91, 0.96, 64),
      new THREE.MeshStandardMaterial({
        color: "#c5a569",
        metalness: 0.14,
        roughness: 0.68,
      }),
    );
    ovalRugBorder.rotation.x = -Math.PI / 2;
    ovalRugBorder.scale.set(4.25, 2.15, 1);
    ovalRugBorder.position.y = 0.012;
    communicationRug.add(ovalRugBorder);
    const ovalRugPattern = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.75, 64),
      new THREE.MeshStandardMaterial({
        color: "#d8c49a",
        roughness: 0.82,
      }),
    );
    ovalRugPattern.rotation.x = -Math.PI / 2;
    ovalRugPattern.scale.set(4.25, 2.15, 1);
    ovalRugPattern.position.y = 0.014;
    communicationRug.add(ovalRugPattern);
    const rugMedallion = new THREE.Mesh(
      new THREE.CircleGeometry(0.46, 32),
      new THREE.MeshStandardMaterial({
        color: "#8c6950",
        roughness: 0.9,
      }),
    );
    rugMedallion.rotation.x = -Math.PI / 2;
    rugMedallion.scale.set(1.55, 0.82, 1);
    rugMedallion.position.y = 0.016;
    communicationRug.add(rugMedallion);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const motif = new THREE.Mesh(
        new THREE.CircleGeometry(0.085, 12),
        new THREE.MeshStandardMaterial({
          color: index % 2 ? "#d8c49a" : "#a8b7a0",
          roughness: 0.9,
        }),
      );
      motif.rotation.x = -Math.PI / 2;
      motif.scale.set(1.1, 1.65, 1);
      motif.position.set(
        Math.cos(angle) * 2.35,
        0.018,
        Math.sin(angle) * 1.18,
      );
      communicationRug.add(motif);
    }
    scene.add(communicationRug);

    addWorkstation(-9.05, -0.72, 1.3, 0.82, Math.PI);
    addActivitySeat("working", -9.05, -1.78, 0, {
      zoneId: "executive",
      requiredUsername: "phong0002",
    });
    addWorkstation(-7.25, -0.72, 1.3, 0.82, Math.PI);
    addActivitySeat("working", -7.25, -1.78, 0, {
      zoneId: "executive",
      requiredUsername: "truong0003",
    });
    addWorkstation(8.35, -5.7, 2.45, 1.25, Math.PI / 2, true);
    addActivitySeat("working", 9.35, -5.7, -Math.PI / 2, {
      zoneId: "administration",
      requiredUsername: "dung0001",
      executiveChair: true,
    });
    addPlant(scene, 10.05, -7.05, 0.9);
    addPlant(scene, 6.2, -7.1, 0.82, "#688762");

    addWorkstation(-8.2, 5.55, 1.8, 1);
    addActivitySeat("working", -8.2, 6.62, Math.PI, {
      zoneId: "documents",
      requiredUsername: "anh0004",
    });
    const aquariumFish: {
      group: THREE.Group;
      tail: THREE.Mesh;
      target: THREE.Vector3;
      direction: THREE.Vector3;
      speed: number;
      retargetIn: number;
      phase: number;
    }[] = [];
    const aquarium = new THREE.Group();
    aquarium.position.set(-8.05, 0, 2.4);
    const aquariumCabinetMaterial = new THREE.MeshStandardMaterial({
      color: "#283b38",
      roughness: 0.34,
      metalness: 0.42,
    });
    const aquariumTrimMaterial = new THREE.MeshStandardMaterial({
      color: "#c5a569",
      roughness: 0.28,
      metalness: 0.7,
    });
    const aquariumGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: "#d9f4f2",
      transparent: true,
      opacity: 0.14,
      roughness: 0.08,
      metalness: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const aquariumCabinet = new THREE.Mesh(
      roundedBoxGeometry(2.85, 0.56, 1.42, 0.1),
      aquariumCabinetMaterial,
    );
    aquariumCabinet.position.y = 0.31;
    aquariumCabinet.userData.blocksActors = true;
    aquarium.add(aquariumCabinet);
    const cabinetPlinth = new THREE.Mesh(
      roundedBoxGeometry(2.68, 0.12, 1.3, 0.04),
      aquariumTrimMaterial,
    );
    cabinetPlinth.position.y = 0.08;
    aquarium.add(cabinetPlinth);
    const tankBottom = new THREE.Mesh(
      roundedBoxGeometry(2.62, 0.08, 1.2, 0.035),
      aquariumCabinetMaterial,
    );
    tankBottom.position.y = 0.62;
    tankBottom.userData.blocksActors = true;
    aquarium.add(tankBottom);
    const tankCenterY = 1.17;
    const tankHeight = 1.04;
    const tankWidth = 2.62;
    const tankDepth = 1.2;
    const glassPanels = [
      {
        size: [0.035, tankHeight, tankDepth] as [number, number, number],
        position: [-tankWidth / 2, tankCenterY, 0] as [number, number, number],
      },
      {
        size: [0.035, tankHeight, tankDepth] as [number, number, number],
        position: [tankWidth / 2, tankCenterY, 0] as [number, number, number],
      },
      {
        size: [tankWidth, tankHeight, 0.035] as [number, number, number],
        position: [0, tankCenterY, -tankDepth / 2] as [number, number, number],
      },
      {
        size: [tankWidth, tankHeight, 0.035] as [number, number, number],
        position: [0, tankCenterY, tankDepth / 2] as [number, number, number],
      },
    ];
    for (const panel of glassPanels) {
      const glass = new THREE.Mesh(
        roundedBoxGeometry(...panel.size, 0.018),
        aquariumGlassMaterial,
      );
      glass.position.set(...panel.position);
      glass.userData.blocksActors = true;
      aquarium.add(glass);
    }
    const aquariumWater = new THREE.Mesh(
      new THREE.PlaneGeometry(2.54, 1.12),
      new THREE.MeshPhysicalMaterial({
        color: "#55b8c2",
        transparent: true,
        opacity: 0.36,
        roughness: 0.1,
        metalness: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    aquariumWater.rotation.x = -Math.PI / 2;
    aquariumWater.position.y = 1.63;
    aquarium.add(aquariumWater);
    const aquariumSand = new THREE.Mesh(
      new THREE.BoxGeometry(2.48, 0.065, 1.08),
      new THREE.MeshStandardMaterial({ color: "#ded3b6", roughness: 0.95 }),
    );
    aquariumSand.position.y = 0.7;
    aquarium.add(aquariumSand);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: "#6d7064",
      roughness: 0.92,
    });
    for (const [x, z, scale] of [
      [-0.82, -0.12, 0.3],
      [-0.56, -0.24, 0.22],
      [0.72, 0.2, 0.28],
      [0.94, 0.1, 0.19],
      [0.12, -0.28, 0.14],
    ]) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(scale, 0),
        rockMaterial,
      );
      rock.position.set(x, 0.76 + scale * 0.42, z);
      rock.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
      rock.scale.set(1.25, 0.8, 0.9);
      aquarium.add(rock);
    }
    const aquaticGreens = ["#4c875f", "#6a9c62", "#39735b"];
    for (let plant = 0; plant < 10; plant += 1) {
      const x = -1.02 + (plant % 5) * 0.5;
      const z = plant < 5 ? -0.38 : 0.38;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.027, 0.3 + (plant % 3) * 0.08, 6),
        new THREE.MeshStandardMaterial({
          color: aquaticGreens[plant % aquaticGreens.length],
          roughness: 0.86,
        }),
      );
      stem.position.set(x, 0.86 + stem.geometry.parameters.height / 2, z);
      aquarium.add(stem);
      for (let leaf = 0; leaf < 3; leaf += 1) {
        const blade = new THREE.Mesh(
          new THREE.ConeGeometry(0.055, 0.27, 5),
          stem.material,
        );
        blade.position.set(
          x + Math.sin(leaf * 2.1 + plant) * 0.09,
          0.98 + (plant % 3) * 0.08 + leaf * 0.055,
          z + (leaf - 1) * 0.045,
        );
        blade.rotation.z = Math.sin(leaf + plant) * 0.48;
        blade.rotation.x = Math.cos(leaf * 1.7 + plant) * 0.28;
        aquarium.add(blade);
      }
    }
    const ledBar = new THREE.Mesh(
      roundedBoxGeometry(2.42, 0.075, 0.16, 0.035),
      new THREE.MeshStandardMaterial({
        color: "#f7f3df",
        emissive: "#c8f2ed",
        emissiveIntensity: 1.8,
        roughness: 0.24,
      }),
    );
    ledBar.position.set(0, 1.76, 0);
    aquarium.add(ledBar);
    const aquariumLed = new THREE.PointLight("#b5f5ec", 2.1, 4.5, 1.7);
    aquariumLed.position.set(0, 1.85, 0);
    aquarium.add(aquariumLed);
    const fishColors = ["#f1b85a", "#5fc6c9", "#e78664", "#e4d27a", "#8baee0", "#f0eee2"];
    for (let index = 0; index < 9; index += 1) {
      const fish = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: fishColors[index % fishColors.length],
        roughness: 0.36,
        metalness: 0.08,
      });
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.085 + (index % 3) * 0.014, 12, 8),
        bodyMaterial,
      );
      body.scale.set(1, 0.58, 0.72);
      fish.add(body);
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.13, 4),
        bodyMaterial,
      );
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -0.11;
      fish.add(tail);
      const fin = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.09, 4),
        bodyMaterial,
      );
      fin.rotation.x = Math.PI / 2;
      fin.position.set(0, 0.045, -0.005);
      fish.add(fin);
      const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#1d2c2d" });
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eyeMaterial);
        eye.position.set(side * 0.052, 0.012, 0.045);
        fish.add(eye);
      }
      fish.position.set(
        THREE.MathUtils.randFloat(-0.88, 0.88),
        THREE.MathUtils.randFloat(0.88, 1.48),
        THREE.MathUtils.randFloat(-0.34, 0.34),
      );
      aquarium.add(fish);
      aquariumFish.push({
        group: fish,
        tail,
        target: new THREE.Vector3(
          THREE.MathUtils.randFloat(-0.88, 0.88),
          THREE.MathUtils.randFloat(0.88, 1.48),
          THREE.MathUtils.randFloat(-0.34, 0.34),
        ),
        direction: new THREE.Vector3(),
        speed: THREE.MathUtils.randFloat(0.22, 0.43),
        retargetIn: THREE.MathUtils.randFloat(0.4, 2.4),
        phase: Math.random() * Math.PI * 2,
      });
    }
    scene.add(aquarium);
    for (const viewingSpot of [
    {
      id: "aquarium-viewing-anh0004",
      resourceId: "aquarium-viewing-north",
      username: "anh0004",
      z: 3.78,
      rotation: Math.PI,
    },
    {
      id: "aquarium-viewing-phong0002",
      resourceId: "aquarium-viewing-south",
      username: "phong0002",
      z: 1.02,
      rotation: 0,
    },
    {
      id: "aquarium-viewing-truong0003",
      resourceId: "aquarium-viewing-south",
      username: "truong0003",
      z: 1.02,
      rotation: 0,
    },
    {
      id: "aquarium-viewing-general",
      resourceId: "aquarium-viewing-south",
      username: undefined,
      z: 1.02,
      rotation: 0,
    },
    ]) {
    activitySpots.push({
      id: viewingSpot.id,
      resourceId: viewingSpot.resourceId,
      activity: "chatting",
      position: new THREE.Vector3(-8.05, 0, viewingSpot.z),
      rotation: viewingSpot.rotation,
      zoneId: "aquarium",
      requiredUsername: viewingSpot.username,
      aquariumViewing: true,
    });
    }
    const bookcaseWood = new THREE.MeshStandardMaterial({
      color: "#765640",
      roughness: 0.78,
    });
    const bookcaseAccent = new THREE.MeshStandardMaterial({
      color: "#b78a5a",
      roughness: 0.65,
    });
    const bookcaseParts = [
      { size: [0.52, 0.08, 1.8] as [number, number, number], position: [10.47, 0.2, -2.05] as [number, number, number] },
      { size: [0.52, 0.08, 1.8] as [number, number, number], position: [10.47, 1.95, -2.05] as [number, number, number] },
      { size: [0.52, 1.8, 0.08] as [number, number, number], position: [10.47, 1.08, -2.91] as [number, number, number] },
      { size: [0.52, 1.8, 0.08] as [number, number, number], position: [10.47, 1.08, -1.19] as [number, number, number] },
      { size: [0.08, 1.72, 1.72] as [number, number, number], position: [10.7, 1.08, -2.05] as [number, number, number] },
      ...[0.68, 1.16, 1.64].map((y) => ({
        size: [0.48, 0.055, 1.72] as [number, number, number],
        position: [10.45, y, -2.05] as [number, number, number],
      })),
    ];
    for (const [index, part] of bookcaseParts.entries()) {
      box(
        scene,
        part.size,
        part.position,
        index === 1 ? bookcaseAccent : bookcaseWood,
        { blocksActors: true },
      );
    }
    const bookMaterials = [
      "#526f68",
      "#b56f52",
      "#d0b477",
      "#667b91",
      "#8b6656",
      "#839276",
    ].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86 }));
    for (const [shelf, y] of [0.43, 0.91, 1.39].entries()) {
      for (let book = 0; book < 8; book += 1) {
        const height = 0.25 + ((book + shelf) % 3) * 0.055;
        const spine = new THREE.Mesh(
          roundedBoxGeometry(0.28, height, 0.13, 0.025),
          bookMaterials[(book + shelf * 2) % bookMaterials.length],
        );
        spine.position.set(
          10.19,
          y + height / 2,
          -2.73 + book * 0.195,
        );
        spine.userData.blocksActors = false;
        scene.add(spine);
      }
    }
    for (const [index, roomX] of restroomRoomCenters.entries()) {
      addActivitySeat("chatting", roomX, restroomCenterZ, 0, {
        zoneId: "restroom",
        manualOnly: "restroom",
      });
      const roomLabel = addRoomLabel(
        scene,
        translateText(
          index === 0 ? "Men's restroom" : "Women's restroom",
          languageRef.current,
        ),
        roomX,
        restroomBack - 0.18,
      );
      if (roomLabel) {
        roomLabel.scale.set(2.2, 0.48, 1);
        roomLabel.userData.sceneLabelType = "location";
        roomLabel.visible = true;
        roomLabelsRef.current.push(roomLabel);
      }
    }
    addActivitySeat("chatting", 6.55, -4.25, Math.PI / 2, {
      zoneId: "administration",
      manualOnly: "report",
    });
    for (const z of [-2.25, 1.38]) {
      addPlant(scene, -10.08, z, 0.72);
      addPlant(scene, 10.08, z, 0.72);
    }

    const meetingTableCenter = new THREE.Vector3(-3.55, 0, -5.85);
    const meetingTableHalfWidth = 3.65;
    addDesk(scene, meetingTableCenter.x, meetingTableCenter.z, 7.3, 1.35, 0, false, true);
    addActivitySeat("chatting", 0.92, meetingTableCenter.z, -Math.PI / 2, {
      zoneId: "meeting",
      requiredUsername: "dung0001",
      meetingChairperson: true,
      executiveChair: true,
    });
    for (let index = 0; index < 5; index += 1) {
      const x = -6.05 + index * 1.25;
      addActivitySeat("chatting", x, -4.83, Math.PI, { zoneId: "meeting" });
      addActivitySeat("chatting", x, -6.87, 0, { zoneId: "meeting" });
    }
    const displayCanvas = document.createElement("canvas");
    displayCanvas.width = 640;
    displayCanvas.height = 360;
    const displayContext = displayCanvas.getContext("2d");
    if (displayContext) {
      displayContext.fillStyle = "#102a31";
      displayContext.fillRect(0, 0, 640, 360);
      displayContext.fillStyle = "#27515a";
      displayContext.fillRect(0, 0, 640, 58);
      displayContext.fillStyle = "#e7f2e9";
      displayContext.font = "600 24px Segoe UI, sans-serif";
      displayContext.fillText("DRIKAPEX  |  TEAM MEETING", 30, 39);
      displayContext.fillStyle = "#8cd7c2";
      displayContext.font = "500 18px Segoe UI, sans-serif";
      displayContext.fillText("PEOPLE  ·  IDEAS  ·  PROGRESS", 38, 112);
      displayContext.fillStyle = "#ecce8a";
      displayContext.font = "600 38px Segoe UI, sans-serif";
      displayContext.fillText("Let's build what's next.", 38, 174);
      for (let index = 0; index < 3; index += 1) {
        displayContext.fillStyle = ["#6bc6ad", "#d9b36f", "#84b5cc"][index];
        displayContext.beginPath();
        displayContext.arc(54 + index * 34, 250, 9, 0, Math.PI * 2);
        displayContext.fill();
        displayContext.fillStyle = "#d1ded7";
        displayContext.fillRect(38 + index * 150, 280, 116, 5);
      }
    }
    const displayTexture = new THREE.CanvasTexture(displayCanvas);
    displayTexture.colorSpace = THREE.SRGBColorSpace;
    const meetingDisplayMaterial = new THREE.MeshStandardMaterial({
      color: "#25393d",
      emissive: "#66c7df",
      emissiveMap: displayTexture,
      emissiveIntensity: 0,
      roughness: 0.2,
      metalness: 0.12,
    });
    const displayFrameMaterial = new THREE.MeshStandardMaterial({
      color: "#263438",
      roughness: 0.32,
      metalness: 0.6,
    });
    box(
      scene,
      [0.2, 2.45, 2.8],
      [-9.82, 1.7, meetingTableCenter.z],
      displayFrameMaterial,
      { blocksActors: false },
    );
    const meetingDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(2.42, 1.94),
      meetingDisplayMaterial,
    );
    meetingDisplay.rotation.y = Math.PI / 2;
    meetingDisplay.position.set(-9.704, 1.78, meetingTableCenter.z);
    scene.add(meetingDisplay);
    box(
      scene,
      [0.38, 0.14, 1.6],
      [-9.82, 0.18, meetingTableCenter.z],
      displayFrameMaterial,
    );
    const meetingDisplayLight = new THREE.PointLight("#76d5e8", 0, 5, 2);
    meetingDisplayLight.position.set(-9.45, 2.25, meetingTableCenter.z);
    scene.add(meetingDisplayLight);
    for (const [x, z, scale] of [
      [-10.05, -7.45, 0.58],
      [-10.05, -3.85, 0.58],
      [4.25, -7.25, 0.66],
      [4.25, -4.1, 0.66],
    ]) {
      addPlant(scene, x, z, scale, "#688762");
    }

    const loungeSofas = [
      addSofa(scene, -4.15, 6.2, Math.PI / 2, "#7e9ca4"),
      addSofa(scene, -2.25, 6.2, -Math.PI / 2, "#7e9ca4"),
    ];
    loungeSofas.forEach((sofa, index) => {
      const position = index === 0 ? new THREE.Vector3(-4.15, 0, 6.2) : new THREE.Vector3(-2.25, 0, 6.2);
      const resourceId = `lounge-seat-${index}`;
      const obstacleId = sofa.userData.collisionId as string;
      activitySpots.push(
        {
          id: `${resourceId}-chat`,
          resourceId,
          activity: "chatting",
          position,
          rotation: sofa.rotation.y,
          obstacleId,
          zoneId: "lounge",
        },
      );
    });
    const coffeeTable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.47, 0.47, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: "#c7a37a", roughness: 0.63 }),
    );
    coffeeTable.position.set(-3.2, 0.52, 6.2);
    coffeeTable.userData.blocksActors = true;
    scene.add(coffeeTable);
    addPlant(scene, -5.15, 7.1, 0.8);

    const receptionDesk = new THREE.Group();
    receptionDesk.position.set(4.1, 0, 6.1);
    receptionDesk.rotation.y = -Math.PI / 2;
    receptionDesk.userData.blocksActors = true;
    const receptionCounter = new THREE.Mesh(
      roundedBoxGeometry(3.3, 0.9, 0.85, 0.12),
      wallMaterial,
    );
    receptionCounter.position.y = 0.62;
    receptionDesk.add(receptionCounter);
    const receptionTop = new THREE.Mesh(
      roundedBoxGeometry(3.38, 0.18, 0.92, 0.12),
      new THREE.MeshStandardMaterial({ color: "#c39a6f", roughness: 0.62 }),
    );
    receptionTop.position.y = 1.17;
    receptionDesk.add(receptionTop);
    const receptionFront = new THREE.Mesh(
      roundedBoxGeometry(2.4, 0.42, 0.08, 0.04),
      new THREE.MeshStandardMaterial({ color: "#617a73", roughness: 0.72 }),
    );
    receptionFront.position.set(0, 0.64, 0.44);
    receptionDesk.add(receptionFront);
    scene.add(receptionDesk);
    addActivitySeat("working", 5.16, 6.1, -Math.PI / 2, {
      zoneId: "reception",
    });

    box(
      scene,
      [1.8, 0.14, 1.1],
      [9.3, 0.78, -0.55],
      new THREE.MeshStandardMaterial({ color: "#b88e64", roughness: 0.64 }),
      { blocksActors: true },
    );
    for (const side of [-1, 1]) {
      for (const zOffset of [-0.48, 0.48]) {
        addActivitySeat(
          "eating",
          9.3 + side * 1.35,
          -0.55 + zOffset,
          side < 0 ? Math.PI / 2 : -Math.PI / 2,
          { zoneId: "cafe" },
        );
      }
    }

    for (const zone of zones) {
      const label = addRoomLabel(
        scene,
        translateText(zone.name, languageRef.current),
        zone.x,
        zone.z - zone.depth / 2 + 0.28,
      );
      if (label) {
        label.userData.sceneLabelType = "location";
        label.visible = true;
        roomLabelsRef.current.push(label);
      }
    }
    const interiorLights: InteriorLight[] = [
      addInteriorLight(scene, -8.1, -0.55, 4),
      addInteriorLight(scene, -2.6, -5.6, 4.6),
      addInteriorLight(scene, 8.15, -5.65, 4.2),
      addInteriorLight(scene, -8.1, 5.65, 3.8),
      addInteriorLight(scene, 8.1, -0.55, 4),
      addInteriorLight(scene, 0, 1.5, 3.8),
      addInteriorLight(scene, -3.2, 6.2, 3.6, false),
      addInteriorLight(scene, 4.25, 6.2, 3.6, false),
      addInteriorLight(scene, restroomRoomCenters[0], restroomCenterZ, 2.5),
      addInteriorLight(scene, restroomRoomCenters[1], restroomCenterZ, 2.5),
    ];
    let currentNightFactor = 0;
    const updateRealTimeLighting = (date: Date) => {
      const localHour =
        date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
      const solarAngle = ((localHour - 6) / 12) * Math.PI;
      const daylight = getDaylightFactor(date);
      const night = 1 - daylight;
      backgroundColor.copy(nightSkyColor).lerp(daySkyColor, daylight);
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.copy(backgroundColor);
      }
      roadFogMaterials.forEach((material) => {
        material.color.copy(backgroundColor);
      });
      hemisphere.intensity = 0.72 + daylight * 1.63;
      hemisphere.color
        .set("#c0c6c7")
        .lerp(daylightColor, daylight);
      hemisphere.groundColor
        .set("#303b3b")
        .lerp(daylightGroundColor, daylight);
      sunlight.intensity = 0.12 + daylight * 3.03;
      sunlight.color.set("#f2a66f").lerp(daylightSunColor, daylight);
      sunlight.position
        .set(
          Math.cos(solarAngle) * 21,
          Math.max(1.5, Math.sin(solarAngle) * 24),
          Math.sin(solarAngle) * 12,
        )
        .multiplyScalar(officeScale);
      renderer.toneMappingExposure = 0.94 + daylight * 0.24;
      for (const { fixture, diffuser, light } of interiorLights) {
        fixture.visible = night > 0.05;
        diffuser.emissiveIntensity = 0.05 + night * 1.3;
        const baseIntensity = light.userData.baseIntensity;
        if (typeof baseIntensity === "number") {
          light.intensity = night * baseIntensity;
        }
      }
      for (const roadside of roadsideFixtures) {
        roadside.fixture.visible = night > 0.05;
        roadside.lamp.material.emissiveIntensity = night * 2.4;
        roadside.light.intensity = night * 20;
      }
      for (const windowMaterial of nightWindowMaterials) {
        windowMaterial.emissiveIntensity = night * 1.6;
      }
      entranceSignMaterial.emissiveIntensity = 0.28 + night * 1.9;
      entranceSignGlow.intensity = 0.35 + night * 2.4;
      currentNightFactor = night;
    };
    interiorLights.forEach(({ light }) => {
      light.userData.baseIntensity = light.intensity;
    });
    updateRealTimeLighting(new Date());

    const actorMembers = getOfficeSceneMembers(members);
    const actors = actorMembers.map((member, index) =>
      createActor(scene, member, index),
    );
    const cleaningActor = createActor(
      scene,
      {
        id: "virtual-cleaning-staff",
        employeeId: null,
        name: "Nhân viên vệ sinh",
        username: "cleaning_staff",
        position: "Nhân viên vệ sinh",
        avatarUrl: null,
      },
      actors.length,
    );
    cleaningActor.group.visible = false;
    const disableDynamicShadows = (root: THREE.Object3D) => {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = false;
        object.receiveShadow = false;
      });
    };
    for (const actor of actors) disableDynamicShadows(actor.group);
    disableDynamicShadows(cleaningActor.group);
    for (const vehicle of vehicles) disableDynamicShadows(vehicle.group);
    for (const motorcycle of motorcycles) {
      disableDynamicShadows(motorcycle.group);
      disableDynamicShadows(motorcycle.policeGroup);
    }
    for (const vehicle of cleaningVehicles) {
      disableDynamicShadows(vehicle.group);
    }
    for (const bird of birds) disableDynamicShadows(bird.group);
    disableDynamicShadows(deliveryShipper.group);
    for (const fish of aquariumFish) disableDynamicShadows(fish.group);
    for (const door of doors) {
      for (const panel of door.panels) {
        panel.mesh.castShadow = false;
      }
    }
    actorGroupsRef.current = [
      ...actors.flatMap((actor) =>
      actor.username
        ? [{
            username: actor.username,
            group: actor.group,
            name:
              members.find(
                (member) =>
                  member.username?.trim().toLowerCase() === actor.username,
              )?.name ?? actor.username,
          }]
        : [],
      ),
      {
        username: cleaningActor.username ?? "cleaning_staff",
        group: cleaningActor.group,
        name: "Nhân viên vệ sinh",
      },
    ];
    actorLabelsRef.current = [
      ...actors.flatMap((actor) =>
      actor.group.children.filter(
        (child): child is THREE.Sprite =>
          child instanceof THREE.Sprite &&
          child !== actor.sleepIndicator &&
          child.userData.sceneLabelType === "actor",
      ),
      ),
      ...cleaningActor.group.children.filter(
        (child): child is THREE.Sprite =>
          child instanceof THREE.Sprite &&
          child.userData.sceneLabelType === "actor",
      ),
    ];
    actorLabelsRef.current.forEach((label) => (label.visible = true));
    const obstacleBounds: {
      id?: string;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!object.userData.blocksActors) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;
      obstacleBounds.push({
        id:
          typeof object.userData.collisionId === "string"
            ? object.userData.collisionId
            : undefined,
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
      });
    });

    const meetingSeatObstacleIds = new Set(
      activitySpots
        .filter((spot) => spot.zoneId === "meeting")
        .map((spot) => spot.obstacleId)
        .filter((id): id is string => Boolean(id)),
    );
    const reservations = new Map<string, Actor>();
    const officeBounds = {
      minX: -10.45,
      maxX: 10.45,
      minZ: -7.45,
      maxZ: 7.45,
    };
    const restrictedRoomBarriers: {
      zoneId: "administration" | "executive" | "documents";
      obstacle: (typeof obstacleBounds)[number];
    }[] = [
      ...[
        {
          zoneId: "administration" as const,
          minX: 5.48,
          maxX: 10.95,
          minZ: -7.94,
          doorMinZ: -6.75,
          doorMaxZ: -4.85,
          maxZ: -3.27,
        },
        {
          zoneId: "executive" as const,
          minX: -10.95,
          maxX: -5.48,
          minZ: -3.12,
          doorMinZ: -1.5,
          doorMaxZ: 0.4,
          maxZ: 2.28,
        },
        {
          zoneId: "documents" as const,
          minX: -10.95,
          maxX: -5.48,
          minZ: 3.27,
          doorMinZ: 4.85,
          doorMaxZ: 6.75,
          maxZ: 7.94,
        },
      ].flatMap(({ zoneId, minX, maxX, minZ, doorMinZ, doorMaxZ, maxZ }) => [
        {
          zoneId,
          obstacle: { minX, maxX, minZ, maxZ: doorMinZ },
        },
        {
          zoneId,
          obstacle: { minX, maxX, minZ: doorMaxZ, maxZ },
        },
      ]),
      {
        zoneId: "executive",
        obstacle: {
          minX: -10.95,
          maxX: -5.48,
          minZ: 1.6375,
          maxZ: 3.5375,
        },
      },
    ];
    const actorObstacleCache = new WeakMap<
      Actor,
      {
        reportingToAdmin: boolean;
        meetingParticipant: boolean;
        obstacles: typeof obstacleBounds;
      }
    >();
    const obstaclesForActor = (actor: Actor) => {
      const cached = actorObstacleCache.get(actor);
      if (
        cached?.reportingToAdmin === actor.reportingToAdmin &&
        cached.meetingParticipant === actor.isMeetingParticipant
      ) {
        return cached.obstacles;
      }
      const hasSharedOperationsAccess =
        actor.username?.trim().toLowerCase() !== "dung0001";
      const obstacles = obstacleBounds.concat(
        restrictedRoomBarriers
          .filter(
            ({ zoneId }) => {
              if (zoneId === "executive" || zoneId === "documents") {
                return !hasSharedOperationsAccess;
              }
              return (
                !canEnterOfficeZone(actor.username, zoneId) &&
                !(actor.reportingToAdmin && zoneId === "administration")
              );
            },
          )
          .map(({ obstacle }) => obstacle),
      );
      const navigableObstacles = obstacles.filter(
        (obstacle) =>
          !actor.isMeetingParticipant ||
          !obstacle.id ||
          !meetingSeatObstacleIds.has(obstacle.id),
      );
      actorObstacleCache.set(actor, {
        reportingToAdmin: actor.reportingToAdmin,
        meetingParticipant: actor.isMeetingParticipant,
        obstacles: navigableObstacles,
      });
      return navigableObstacles;
    };
    const doorBoundsScratch = new THREE.Box3();
    const doorCollisionObstacles = doors.flatMap((door) =>
      door.panels.map((panel) => {
        const bounds = doorBoundsScratch.setFromObject(panel.mesh);
        return {
          minX: bounds.min.x,
          maxX: bounds.max.x,
          minZ: bounds.min.z,
          maxZ: bounds.max.z,
        };
      }),
    );
    const collisionDoorOpenAmounts = doors.map((door) => door.openAmount);
    const movementObstacleCache = new WeakMap<
      Actor,
      { key: string; obstacles: typeof obstacleBounds }
    >();
    const movementObstaclesForActor = (actor: Actor) => {
      const now = Date.now();
      const seatIgnoreActive = Boolean(
        actor.seatExitIgnoreObstacleId &&
          (actor.seatExitRestoreAt === undefined ||
            now < actor.seatExitRestoreAt),
      );
      if (!seatIgnoreActive) {
        actor.seatExitIgnoreObstacleId = undefined;
        actor.seatExitRestoreAt = undefined;
      }
      const temporarilyIgnoredSeat = seatIgnoreActive
        ? actor.seatExitIgnoreObstacleId
        : undefined;
      const key = [
        actor.currentObstacleId ?? "",
        actor.goalObstacleId ?? "",
        temporarilyIgnoredSeat ?? "",
        actor.reportingToAdmin ? "admin" : "staff",
        actor.isMeetingParticipant ? "meeting" : "routine",
      ].join(":");
      const cached = movementObstacleCache.get(actor);
      if (cached?.key === key) return cached.obstacles;
      const obstacles = obstaclesForActor(actor)
        .filter(
          (obstacle) =>
            obstacle.id !== actor.goalObstacleId &&
            obstacle.id !== actor.currentObstacleId &&
            obstacle.id !== temporarilyIgnoredSeat,
        )
        .concat(doorCollisionObstacles);
      movementObstacleCache.set(actor, { key, obstacles });
      return obstacles;
    };
    const durationFor = (activity: ActorActivity) => {
      if (activity === "working") return 45 + Math.random() * 70;
      if (activity === "chatting") return 35 + Math.random() * 45;
      if (activity === "eating") return 30 + Math.random() * 45;
      if (activity === "sleeping") return 25 + Math.random() * 35;
      return 0;
    };
    const meetingSpots = activitySpots.filter(
      (spot) => spot.zoneId === "meeting",
    );
    const chairpersonSpot = meetingSpots.find(
      (spot) => spot.meetingChairperson,
    );
    const attendeeSpots = meetingSpots.filter(
      (spot) => !spot.meetingChairperson,
    );
    const meetingParticipants = new Set<Actor>();
    let meetingSessionActive = false;
    let meetingDuration = 0;
    const laptopCarryWorldPosition = new THREE.Vector3();
    const setMeetingLaptopTarget = (actor: Actor, spot: ActivitySpot) => {
      const laptopHalfWidth = 0.31;
      const tableEdgeClearance = 0.06;
      const tableSide = spot.position.z < meetingTableCenter.z ? -1 : 1;
      const worldPosition = new THREE.Vector3(
        THREE.MathUtils.clamp(
          spot.position.x,
          meetingTableCenter.x -
            meetingTableHalfWidth +
            laptopHalfWidth +
            tableEdgeClearance,
          meetingTableCenter.x +
            meetingTableHalfWidth -
            laptopHalfWidth -
            tableEdgeClearance,
        ),
        0.968,
        meetingTableCenter.z + tableSide * 0.28,
      );
      const laptopFacing = Math.atan2(
        spot.position.x - worldPosition.x,
        spot.position.z - worldPosition.z,
      );
      actor.meetingLaptopTargetPosition = worldPosition;
      actor.meetingLaptopTargetRotation = laptopFacing;
    };
    const releaseCurrentSpot = (actor: Actor) => {
      const previousSpot = activitySpots.find((spot) => spot.id === actor.goalSpotId);
      if (previousSpot && reservations.get(previousSpot.resourceId) === actor) {
        reservations.delete(previousSpot.resourceId);
      }
      if (
        previousSpot?.obstacleId &&
        previousSpot.obstacleId === actor.currentObstacleId
      ) {
        actor.seatExitIgnoreObstacleId = previousSpot.obstacleId;
        actor.seatExitRestoreAt = undefined;
      }
      return previousSpot;
    };
    const endMeetingParticipation = (actor: Actor) => {
      meetingParticipants.delete(actor);
      actor.isMeetingParticipant = false;
      actor.isWatchingAquarium = false;
      actor.meetingLaptopReturning = actor.meetingLaptop.visible;
      if (meetingParticipants.size === 0) meetingSessionActive = false;
    };
    const isSpotAvailableForActor = (spot: ActivitySpot, actor: Actor) => {
      const owner = reservations.get(spot.resourceId);
      return !owner || owner === actor;
    };
    const findPathWithinOffice = (
      actor: Actor,
      start: THREE.Vector3,
      goal: THREE.Vector3,
      ignoredObstacleIds: string[],
    ) => {
      const obstacles = obstaclesForActor(actor).filter(
        (obstacle) =>
          obstacle.id !== actor.seatExitIgnoreObstacleId ||
          (actor.seatExitRestoreAt !== undefined &&
            Date.now() >= actor.seatExitRestoreAt),
      );
      const targetObstacle = obstacles.find(
        (obstacle) =>
          obstacle.id &&
          ignoredObstacleIds.includes(obstacle.id) &&
          !isOutsideObstacle(goal, obstacle, actorCollisionRadius),
      );
      if (!targetObstacle) {
        return findCollisionFreePathLeavingObstacle(
          start,
          goal,
          obstacles,
          {
            bounds: officeBounds,
            radius: actorCollisionRadius,
          },
          actor.currentObstacleId,
        );
      }

      const clearance = actorCollisionRadius + 0.08;
      const approachPoints = [
        {
          x: targetObstacle.minX - clearance,
          z: THREE.MathUtils.clamp(
            goal.z,
            targetObstacle.minZ,
            targetObstacle.maxZ,
          ),
        },
        {
          x: targetObstacle.maxX + clearance,
          z: THREE.MathUtils.clamp(
            goal.z,
            targetObstacle.minZ,
            targetObstacle.maxZ,
          ),
        },
        {
          x: THREE.MathUtils.clamp(
            goal.x,
            targetObstacle.minX,
            targetObstacle.maxX,
          ),
          z: targetObstacle.minZ - clearance,
        },
        {
          x: THREE.MathUtils.clamp(
            goal.x,
            targetObstacle.minX,
            targetObstacle.maxX,
          ),
          z: targetObstacle.maxZ + clearance,
        },
      ];
      let bestPath: { x: number; z: number }[] | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const approach of approachPoints) {
        const path = findCollisionFreePathLeavingObstacle(
          start,
          approach,
          obstacles,
          {
            bounds: officeBounds,
            radius: actorCollisionRadius,
          },
          actor.currentObstacleId,
        );
        if (!path) continue;
        const distance = path.reduce(
          (total, point, index) =>
            index === 0
              ? total
              : total +
                Math.hypot(
                  point.x - path[index - 1].x,
                  point.z - path[index - 1].z,
                ),
          0,
        );
        if (distance < bestDistance) {
          bestPath = path;
          bestDistance = distance;
        }
      }
      return bestPath ? [...bestPath, { x: goal.x, z: goal.z }] : null;
    };
    const findPathForActor = (
      actor: Actor,
      goal: THREE.Vector3,
      ignoredObstacleIds: string[] = [],
    ) => {
      const currentPosition = actor.group.position;
      const outsideSouthEntrance =
        currentPosition.z > officeBounds.maxZ &&
        Math.abs(currentPosition.x) < 2;
      if (outsideSouthEntrance) {
        actor.currentObstacleId = undefined;
        actor.currentSeatPosition = undefined;
        const insideDoor = new THREE.Vector3(0, 0, 7.08);
        const pathInside = findPathWithinOffice(
          actor,
          insideDoor,
          goal,
          ignoredObstacleIds,
        );
        if (!pathInside) return null;
        return [
          currentPosition.clone(),
          new THREE.Vector3(0, 0, 8.7),
          new THREE.Vector3(0, 0, 7.85),
          ...pathInside.map(({ x, z }) => new THREE.Vector3(x, 0, z)),
        ];
      }
      const currentObstacle = obstacleBounds.find(
        (obstacle) => obstacle.id === actor.currentObstacleId,
      );
      if (
        currentObstacle &&
        isOutsideObstacle(
          actor.group.position,
          currentObstacle,
          actorCollisionRadius,
        )
      ) {
        if (
          actor.seatExitIgnoreObstacleId === currentObstacle.id
        ) {
          actor.seatExitRestoreAt ??= Date.now() + 2_000;
        }
        actor.currentObstacleId = undefined;
        actor.currentSeatPosition = undefined;
        if (actor.seatExitIgnoreObstacleId === currentObstacle.id) {
          actor.seatExitRestoreAt ??= Date.now() + 2_000;
        }
      }
      return findPathWithinOffice(
        actor,
        actor.group.position,
        goal,
        ignoredObstacleIds,
      );
    };
    const sendToSpot = (actor: Actor, spot: ActivitySpot) => {
      const ignoredObstacleIds = [
        spot.obstacleId,
      ].filter((id): id is string => Boolean(id));
      const path = findPathForActor(actor, spot.position, ignoredObstacleIds);
      if (!path) return false;
      releaseCurrentSpot(actor);
      actor.isWatchingAquarium = false;
      actor.goalSpotId = spot.id;
      actor.goalObstacleId = spot.obstacleId;
      actor.activity = "walking";
      actor.path = path.map(({ x, z }) => new THREE.Vector3(x, 0, z));
      actor.pathIndex = actor.path.length > 1 ? 1 : 0;
      actor.targetRotation = spot.rotation;
      reservations.set(spot.resourceId, actor);
      return true;
    };
    const sendToMeetingExit = (actor: Actor) => {
      releaseCurrentSpot(actor);
      const exitPoints = [
        new THREE.Vector3(2.15, 0, meetingTableCenter.z),
        new THREE.Vector3(2.15, 0, -4.25),
        new THREE.Vector3(-0.2, 0, -3.95),
      ];
      for (const exitPoint of exitPoints) {
        const path = findPathForActor(actor, exitPoint);
        if (!path) continue;
        actor.goalSpotId = null;
        actor.goalObstacleId = undefined;
        actor.isWatchingAquarium = false;
        actor.activity = "walking";
        actor.path = path.map(({ x, z }) => new THREE.Vector3(x, 0, z));
        actor.pathIndex = actor.path.length > 1 ? 1 : 0;
        actor.targetRotation = Math.atan2(
          exitPoint.x - actor.group.position.x,
          exitPoint.z - actor.group.position.z,
        );
        return true;
      }
      return false;
    };
    const deliveryReceivePosition = () => {
      const endpoint = deliveryShipper.approachRoute.getPointAt(
        1,
        new THREE.Vector3(),
      );
      const heading = deliveryShipper.approachRoute
        .getTangentAt(1, new THREE.Vector3())
        .normalize();
      const side = new THREE.Vector3(-heading.z, 0, heading.x)
        .multiplyScalar(-1.35);
      return endpoint.add(side).setY(0);
    };
    const createDeliveryExitPath = (
      actor: Actor,
      receivePosition: THREE.Vector3,
    ) => {
      const insideDoor = new THREE.Vector3(0, 0, 7.08);
      const path = findPathForActor(actor, insideDoor);
      if (!path) return null;
      return [
        ...path.map(({ x, z }) => new THREE.Vector3(x, 0, z)),
        new THREE.Vector3(0, 0, 7.85),
        new THREE.Vector3(0, 0, 8.7),
        receivePosition,
      ];
    };
    const sendActorToDelivery = (actor: Actor) => {
      const path = createDeliveryExitPath(
        actor,
        deliveryReceivePosition(),
      );
      if (!path) return false;
      releaseCurrentSpot(actor);
      actor.goalSpotId = null;
      actor.goalObstacleId = undefined;
      actor.manualControlAction = null;
      actor.deliveryTask = "outbound";
      actor.carriedPackage.visible = false;
      actor.activity = "walking";
      actor.path = path;
      actor.pathIndex = actor.path.length > 1 ? 1 : 0;
      actor.targetRotation = 0;
      return true;
    };
    const isEligibleDeliveryActor = (actor: Actor) =>
      actor.username?.trim().toLowerCase() !== "dung0001" &&
      actor.deliveryTask === "none" &&
      actor.manualControlAction === null &&
      !actor.isMeetingParticipant;
    const startDeliveryCommunication = (actor: Actor) => {
      actor.phone.visible = false;
      actor.deliveryTask = "communication_wait";
      actor.currentAction = null;
      actor.activityTime = 2;
      actor.deliveryReturnSpotId = actor.goalSpotId ?? undefined;
      const communicationSpots = shuffleItems(
        activitySpots.filter(
          (spot) =>
            spot.zoneId === "communication" &&
            spot.activity === "working" &&
            isSpotAvailableForActor(spot, actor),
        ),
      );
      const communicationSpot = communicationSpots.find((spot) =>
        sendToSpot(actor, spot),
      );
      if (!communicationSpot) {
        releaseCurrentSpot(actor);
        actor.goalSpotId = null;
        actor.goalObstacleId = undefined;
        actor.currentObstacleId = undefined;
        actor.currentSeatPosition = undefined;
        actor.path = [];
        actor.pathIndex = 0;
        actor.activity = "chatting";
      }
      deliveryShipper.phase = "communication_wait";
    };
    const cancelDeliveryForActor = (actor: Actor) => {
      if (actor.deliveryTask === "none") return;
      actor.phone.visible = false;
      actor.deliveryTask = "none";
      actor.deliveryReturnSpotId = undefined;
      actor.carriedPackage.visible = false;
      if (deliveryShipper.recipient !== actor) return;
      deliveryShipper.recipient = null;
      if (deliveryShipper.packageInTransfer) {
        deliveryShipper.group.attach(deliveryShipper.package);
        deliveryShipper.package.position.set(0, 0.98, 0.62);
        deliveryShipper.package.visible = true;
        deliveryShipper.packageInTransfer = false;
        deliveryShipper.packageHandedOff = false;
      }
      if (
        deliveryShipper.phase === "actor_call" ||
        deliveryShipper.phase === "communication_wait"
      ) {
        deliveryShipper.phase = "idle";
        deliveryShipper.group.visible = false;
        deliveryShipper.respawnTime = 35 + Math.random() * 40;
        return;
      }
      if (
        deliveryShipper.phase === "approaching" ||
        deliveryShipper.phase === "calling" ||
        deliveryShipper.phase === "waiting_actor" ||
        deliveryShipper.phase === "pickup" ||
        deliveryShipper.phase === "mounting"
      ) {
        deliveryShipper.package.visible = true;
        deliveryShipper.phone.visible = false;
        deliveryShipper.kickstand.visible = false;
        deliveryShipper.phase = "departing";
        deliveryShipper.progress = 0;
      }
    };
    const assignNextActivity = (actor: Actor) => {
      cancelDeliveryForActor(actor);
      if (actor.isMeetingParticipant) endMeetingParticipation(actor);
      actor.manualControlAction = null;
      actor.reportingToAdmin = false;
      actor.isWatchingAquarium = false;
      const previousSpot = releaseCurrentSpot(actor);
      const previousActivity = actor.activity;
      actor.goalSpotId = null;
      actor.goalObstacleId = undefined;
      actor.activity = "walking";
      actor.path = [];
      actor.pathIndex = 0;
      const username = actor.username?.trim().toLowerCase();
      if (username === "dung0001" && !meetingSessionActive) {
        const administrationDesk = activitySpots.find(
          (spot) =>
            spot.zoneId === "administration" &&
            spot.activity === "working" &&
            spot.requiredUsername === username,
        );
        if (
          administrationDesk &&
          isSpotAvailableForActor(administrationDesk, actor) &&
          sendToSpot(actor, administrationDesk)
        ) {
          actor.activityTime = Number.POSITIVE_INFINITY;
          return;
        }
      }
      const usernameHasAquariumSide =
        username === "anh0004" ||
        username === "phong0002" ||
        username === "truong0003";
      const aquariumSpot = activitySpots.find(
        (spot) =>
          spot.aquariumViewing &&
          (usernameHasAquariumSide
            ? spot.requiredUsername === username
            : !spot.requiredUsername) &&
          isSpotAvailableForActor(spot, actor),
      );
      if (
        username !== "dung0001" &&
        aquariumSpot &&
        Math.random() < 0.14 &&
        sendToSpot(actor, aquariumSpot)
      ) {
        actor.activityTime = 20 + Math.random() * 35;
        return;
      }
      const takingDeskNap =
        username !== "dung0001" &&
        previousActivity !== "sleeping" &&
        Math.random() < 0.035;
      const available = excludeCurrentOfficeSpot(
        activitySpots,
        previousSpot?.resourceId ?? null,
      ).filter(
        (spot) =>
          !reservations.has(spot.resourceId) &&
          spot.zoneId !== "meeting" &&
          !spot.manualOnly &&
          (!spot.zoneId || canEnterOfficeZone(actor.username, spot.zoneId)) &&
          (username !== "dung0001" || spot.activity !== "sleeping") &&
          (username !== "dung0001" || spot.zoneId !== "meeting") &&
          (!spot.requiredUsername ||
            username === spot.requiredUsername.toLowerCase()),
      );
      const preferredZone = getPreferredOfficeZone(actor.username, Math.random());
      const rolePreference = preferredZone
        ? available.filter(
            (spot) =>
              spot.zoneId === preferredZone && spot.activity !== "sleeping",
          )
        : [];
      const roleFallback =
        username === "dung0001"
          ? available.filter(
              (spot) =>
                spot.zoneId !== "meeting" && spot.activity !== "sleeping",
            )
          : username === "phong0002" || username === "truong0003"
            ? available.filter(
                (spot) =>
                  spot.zoneId === "executive" && spot.activity !== "sleeping",
              )
            : username === "anh0004"
              ? available.filter(
                  (spot) =>
                    spot.zoneId === "documents" &&
                    spot.activity !== "sleeping",
                )
              : [];
      const weightedActivities: ActivitySpot["activity"][] = [
        "working",
        "working",
        "working",
        "working",
        "chatting",
        "chatting",
        "chatting",
        "eating",
        "eating",
      ];
      const preferred =
        weightedActivities[
          Math.floor(Math.random() * weightedActivities.length)
        ];
      const choices = [
        ...(takingDeskNap
          ? shuffleItems(
              available.filter((spot) => spot.activity === "sleeping"),
            )
          : []),
        ...shuffleItems(rolePreference),
        ...shuffleItems(available.filter(
          (spot) =>
            spot.activity === preferred &&
            spot.id !== previousSpot?.id &&
            spot.activity !== previousActivity,
        )),
        ...shuffleItems(available.filter(
          (spot) =>
            spot.activity !== preferred &&
            spot.id !== previousSpot?.id &&
            spot.activity !== previousActivity,
        )),
        ...shuffleItems(available.filter(
          (spot) =>
            spot.id !== previousSpot?.id &&
            spot.activity === previousActivity,
        )),
        ...shuffleItems(available.filter((spot) => spot.id === previousSpot?.id)),
        ...shuffleItems(roleFallback),
      ];
      for (const spot of choices) {
        if (!sendToSpot(actor, spot)) continue;
        actor.activityTime = durationFor(spot.activity);
        return;
      }
      actor.path = [];
      actor.pathIndex = 0;
      actor.goalSpotId = null;
      actor.activity = "chatting";
      actor.activityTime = 2 + Math.random() * 2;
    };
    const resumeActorAfterMeeting = (actor: Actor) => {
      actor.meetingReturnPending = false;
      const returnSpot = activitySpots.find(
        (spot) => spot.id === actor.meetingReturnSpotId,
      );
      const returnActivityTime = actor.meetingReturnActivityTime ?? 0;
      if (
        returnSpot &&
        isSpotAvailableForActor(returnSpot, actor) &&
        sendToSpot(actor, returnSpot)
      ) {
        actor.activityTime = returnActivityTime;
      } else if (!sendToMeetingExit(actor)) {
        assignNextActivity(actor);
      }
      actor.meetingReturnSpotId = undefined;
      actor.meetingReturnActivityTime = undefined;
    };
    const startTeamMeeting = () => {
      const chairperson = actors.find(
        (actor) => actor.username?.trim().toLowerCase() === "dung0001",
      );
      if (
        !chairperson ||
        !chairpersonSpot ||
        attendeeSpots.length === 0
      ) {
        return;
      }
      meetingSessionActive = true;
      const sharedMeeting = officeMeetingRef.current;
      const meetingExpiresAt = sharedMeeting?.meeting_expires_at;
      meetingDuration = meetingExpiresAt &&
        Date.parse(meetingExpiresAt) > Date.now()
        ? Math.max(
            1,
            (Date.parse(meetingExpiresAt) - Date.now()) / 1000,
          )
        : durationFor("chatting");
      for (const actor of actors) {
        if (!actor.isMeetingParticipant) {
          actor.meetingReturnSpotId = actor.goalSpotId;
          actor.meetingReturnActivityTime = actor.activityTime;
        }
        cancelDeliveryForActor(actor);
        releaseCurrentSpot(actor);
        actor.goalSpotId = null;
        actor.goalObstacleId = undefined;
        actor.path = [];
        actor.pathIndex = 0;
        actor.manualControlAction = null;
        actor.reportingToAdmin = false;
        actor.isWatchingAquarium = false;
        actor.isMeetingParticipant = true;
        actor.meetingReturnPending = false;
        actor.meetingLaptop.visible = true;
        meetingParticipants.add(actor);
      }
      const seating = assignMeetingSeats(
        [
          chairperson,
          ...actors
            .filter((actor) => actor !== chairperson)
            .sort((left, right) =>
              (left.username ?? "").localeCompare(right.username ?? ""),
            ),
        ],
        chairpersonSpot,
        [...attendeeSpots].sort(
          (left, right) =>
            left.position.x - right.position.x ||
            left.position.z - right.position.z,
        ),
      );
      for (const { actor, seat: spot } of seating) {
        const candidateSeats = [
          spot,
          ...attendeeSpots.filter((seat) => seat !== spot),
        ];
        const seatedSpot = candidateSeats.find(
          (seat) =>
            isSpotAvailableForActor(seat, actor) && sendToSpot(actor, seat),
        );
        if (seatedSpot) {
          setMeetingLaptopTarget(actor, seatedSpot);
          continue;
        }
        endMeetingParticipation(actor);
        assignNextActivity(actor);
      }
      for (const actor of actors) {
        if (meetingParticipants.has(actor) && !actor.goalSpotId) {
          endMeetingParticipation(actor);
          assignNextActivity(actor);
        }
      }
    };
    const lastAppliedControlByActor = new Map<string, string>();
    let lastAppliedMeetingUpdate = "";
    let lastAppliedMeetingActive = false;
    const applySharedOfficeControls = () => {
      const sharedMeeting = localMeetingRef.current ?? officeMeetingRef.current;
      const meetingActive = isOfficeMeetingActive(sharedMeeting);
      if (meetingActive) {
        const meetingUpdate = sharedMeeting?.updated_at ?? "";
        if (meetingUpdate !== lastAppliedMeetingUpdate) {
          startTeamMeeting();
          lastAppliedMeetingUpdate = meetingUpdate;
        }
      } else if (lastAppliedMeetingActive) {
        for (const actor of actors) {
          if (!actor.isMeetingParticipant) continue;
          const returnSpot = activitySpots.find(
            (spot) => spot.id === actor.meetingReturnSpotId,
          );
          const returnActivityTime = actor.meetingReturnActivityTime ?? 0;
          endMeetingParticipation(actor);
          if (actor.meetingLaptop.visible) {
            actor.meetingReturnPending = true;
          } else if (
            returnSpot &&
            isSpotAvailableForActor(returnSpot, actor) &&
            sendToSpot(actor, returnSpot)
          ) {
            actor.activityTime = returnActivityTime;
            actor.meetingReturnSpotId = undefined;
            actor.meetingReturnActivityTime = undefined;
          } else {
            actor.meetingReturnSpotId = undefined;
            actor.meetingReturnActivityTime = undefined;
            if (!sendToMeetingExit(actor)) assignNextActivity(actor);
          }
        }
      }
      lastAppliedMeetingActive = meetingActive;

      const controlStates = officeActorStatesRef.current.filter(
        (state) => state.actor_user_id !== currentUserId,
      );
      if (
        localControlStateRef.current &&
        !localControlStateRef.current.action.startsWith("summon_")
      ) {
        controlStates.push(localControlStateRef.current);
      }
      for (const state of controlStates) {
        const actor = actors.find((item) => item.username?.toLowerCase() === state.actor_username);
        if (!actor) continue;
        const actionKey = `${state.mode}:${state.action}:${state.updated_at}`;
        if (lastAppliedControlByActor.get(state.actor_user_id) === actionKey) {
          continue;
        }
        lastAppliedControlByActor.set(state.actor_user_id, actionKey);
        const action =
          state.action === "open_meeting" ? "meeting" : state.action;
        if (
          state.mode === "auto" &&
          state.actor_username.trim().toLowerCase() === "dung0001"
        ) {
          if (state.action === "summon_bird") pendingBirdCalls += 1;
          if (state.action === "summon_motorcycle") {
            pendingMotorcycleCalls.push(false);
          }
          if (state.action === "summon_police_motorcycle") {
            pendingMotorcycleCalls.push(true);
          }
          if (
            state.action === "summon_bird" ||
            state.action === "summon_motorcycle" ||
            state.action === "summon_police_motorcycle"
          ) {
            continue;
          }
        }
        if (meetingActive) continue;
        if (state.mode !== "manual") {
          if (actor.manualControlAction) assignNextActivity(actor);
          continue;
        }
        cancelDeliveryForActor(actor);
        actor.manualControlAction = action;
        actor.reportingToAdmin = action === "report";
        if (action === "hold") {
          releaseCurrentSpot(actor);
          actor.goalSpotId = null;
          actor.goalObstacleId = undefined;
          actor.currentObstacleId = undefined;
          actor.currentSeatPosition = undefined;
          actor.path = [];
          actor.pathIndex = 0;
          actor.activity = "chatting";
          actor.activityTime = Number.POSITIVE_INFINITY;
          actor.targetRotation = actor.group.rotation.y;
          continue;
        }

        const actorName = actor.username?.trim().toLowerCase();
        const preferredPersonalZone =
          actorName === "dung0001"
            ? "administration"
            : actorName === "anh0004"
              ? "documents"
              : "executive";
        let targetSpots: ActivitySpot[] = [];
        if (action === "personal") {
          targetSpots = activitySpots.filter(
            (spot) =>
              spot.activity === "working" &&
              spot.zoneId === preferredPersonalZone &&
              (!spot.requiredUsername ||
                spot.requiredUsername.toLowerCase() === actorName),
          );
        } else if (action === "meeting") {
          targetSpots = [];
        } else if (action === "cafe") {
          targetSpots = activitySpots.filter(
            (spot) =>
              spot.zoneId === "cafe" &&
              spot.activity === "eating",
          );
        } else if (action === "restroom" || action === "report") {
          targetSpots = activitySpots.filter(
            (spot) => spot.manualOnly === action,
          );
        }
        const reachableSpot = targetSpots.find(
          (spot) =>
            isSpotAvailableForActor(spot, actor) && sendToSpot(actor, spot),
        );
        if (reachableSpot) continue;
        actor.manualControlAction = null;
        actor.reportingToAdmin = false;
        if (actor.username?.toLowerCase() === localUsername) {
          setOfficeActionError(
            "No reachable office destination is available for this control.",
          );
        }
      }
    };
    actors.forEach(assignNextActivity);

    const floorplan = new THREE.Group();
    for (const child of [...scene.children]) {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Group ||
        child instanceof THREE.Sprite
      ) {
        scene.remove(child);
        floorplan.add(child);
      }
    }
    floorplan.scale.set(officeScale, officeScale, officeScale);
    scene.add(floorplan);
    type CleaningTask = {
      tool: CleaningTool;
      duration: number;
      rotation: number;
    };
    type CleaningStop = {
      id: string;
      position: THREE.Vector3;
      tasks: CleaningTask[];
    };
    type CleaningPhase =
      | "idle"
      | "arriving"
      | "walking-in"
      | "opening-restroom"
      | "walking-to-stop"
      | "admin-greeting"
      | "cleaning"
      | "walking-to-exit"
      | "walking-out"
      | "departing";
    const cleaningStops: CleaningStop[] = [
      {
        id: "administration",
        position: new THREE.Vector3(7.15, 0, -4.18),
        tasks: [
          { tool: "broom", duration: 3.2, rotation: Math.PI / 3 },
          { tool: "cloth", duration: 3.4, rotation: -Math.PI / 2 },
          { tool: "wateringCan", duration: 2.8, rotation: Math.PI },
        ],
      },
      {
        id: "meeting",
        position: new THREE.Vector3(0.9, 0, -4.12),
        tasks: [
          { tool: "broom", duration: 3.4, rotation: 0 },
          { tool: "cloth", duration: 3.6, rotation: Math.PI / 2 },
          { tool: "wateringCan", duration: 2.6, rotation: -Math.PI / 2 },
        ],
      },
      {
        id: "executive",
        position: new THREE.Vector3(-8.1, 0, -0.35),
        tasks: [
          { tool: "broom", duration: 3.1, rotation: Math.PI },
          { tool: "cloth", duration: 3.5, rotation: Math.PI / 2 },
          { tool: "wateringCan", duration: 2.8, rotation: -Math.PI / 2 },
        ],
      },
      {
        id: "documents",
        position: new THREE.Vector3(-8.1, 0, 4.65),
        tasks: [
          { tool: "broom", duration: 3.1, rotation: 0 },
          { tool: "cloth", duration: 3.4, rotation: -Math.PI / 2 },
          { tool: "wateringCan", duration: 2.7, rotation: Math.PI },
        ],
      },
      {
        id: "communication",
        position: new THREE.Vector3(0, 0, 1.5),
        tasks: [
          { tool: "broom", duration: 3.2, rotation: Math.PI / 2 },
          { tool: "cloth", duration: 3.4, rotation: 0 },
        ],
      },
      {
        id: "lounge",
        position: new THREE.Vector3(-3.2, 0, 7.05),
        tasks: [
          { tool: "broom", duration: 3.2, rotation: Math.PI },
          { tool: "cloth", duration: 3.3, rotation: Math.PI / 2 },
          { tool: "wateringCan", duration: 2.6, rotation: 0 },
        ],
      },
      {
        id: "reception",
        position: new THREE.Vector3(4.1, 0, 7.05),
        tasks: [
          { tool: "broom", duration: 3.2, rotation: Math.PI },
          { tool: "cloth", duration: 3.5, rotation: Math.PI / 2 },
        ],
      },
      {
        id: "cafe",
        position: new THREE.Vector3(9.2, 0, 1.12),
        tasks: [
          { tool: "mop", duration: 3.8, rotation: Math.PI },
          { tool: "cloth", duration: 3.5, rotation: Math.PI / 2 },
          { tool: "wateringCan", duration: 2.7, rotation: 0 },
        ],
      },
      {
        id: "restroom",
        position: new THREE.Vector3(7.5, 0, 5.85),
        tasks: [
          { tool: "mop", duration: 4.1, rotation: 0 },
          { tool: "cloth", duration: 3.8, rotation: -Math.PI / 2 },
        ],
      },
    ];
    const completedCleaningShifts = new Set<string>();
    let cleaningPhase: CleaningPhase = "idle";
    let activeCleaningVehicle: CleaningServiceVehicle | null = null;
    let cleaningStopIndex = 0;
    let cleaningTaskIndex = 0;
    let cleaningTaskTime = 0;
    let cleaningGreetingTime = 0;
    let cleaningScheduleCheckAt = 0;
    let cleaningOutsidePath = false;
    let cleaningCurrentTool: CleaningTool | null = null;
    let cleaningResumeTool: CleaningTool | null = null;
    const greetedThisShift = new Set<Actor>();
    const restroomDoors = doors.filter((door) => door.manual);
    const setCleaningTool = (tool: CleaningTool | null) => {
      cleaningCurrentTool = tool;
      const tools = cleaningActor.cleaningTools;
      if (!tools) return;
      for (const [name, object] of Object.entries(tools)) {
        object.visible = name === tool;
      }
    };
    const setCleaningPath = (path: THREE.Vector3[], outside = false) => {
      cleaningActor.path = path;
      cleaningActor.pathIndex = path.length > 1 ? 1 : 0;
      cleaningActor.activity = "walking";
      cleaningActor.goalSpotId = null;
      cleaningActor.goalObstacleId = undefined;
      cleaningOutsidePath = outside;
    };
    const setInteriorCleaningPath = (
      destination: THREE.Vector3,
      exiting = false,
    ) => {
      const path = findPathForActor(cleaningActor, destination);
      if (!path) {
        console.warn(
          `Unable to find a cleaning route to ${cleaningStops[cleaningStopIndex]?.id ?? "the office entrance"}.`,
        );
        const stop = cleaningStops[cleaningStopIndex];
        if (!exiting && stop) {
          cleaningPhase = "cleaning";
          cleaningTaskIndex = stop.tasks.length;
          cleaningTaskTime = 0;
        } else {
          setCleaningPath(
            [
              cleaningActor.group.position.clone(),
              new THREE.Vector3(0, 0, 8.7),
            ],
            true,
          );
          cleaningPhase = "walking-out";
        }
        return false;
      }
      setCleaningPath(
        path.map(({ x, z }) => new THREE.Vector3(x, 0, z)),
      );
      return true;
    };
    const setExteriorWalkInPath = () => {
      setCleaningPath(
        [
          new THREE.Vector3(-12.5, 0, -9.45),
          new THREE.Vector3(-12.5, 0, -7.2),
          new THREE.Vector3(-12.5, 0, -1.5),
          new THREE.Vector3(-12.5, 0, 4.5),
          new THREE.Vector3(-12.1, 0, 7.6),
          new THREE.Vector3(-10.2, 0, 8.72),
          new THREE.Vector3(-6, 0, 8.72),
          new THREE.Vector3(-2, 0, 8.72),
          new THREE.Vector3(0, 0, 8.7),
        ],
        true,
      );
      cleaningPhase = "walking-in";
    };
    const startCleaningStop = (index: number) => {
      cleaningStopIndex = index;
      const stop = cleaningStops[index];
      if (!stop) return;
      if (stop.id === "restroom") {
        for (const door of restroomDoors) door.manualTargetOpen = true;
        cleaningPhase = "opening-restroom";
        cleaningTaskTime = 0;
        cleaningActor.activity = "working";
        cleaningActor.group.position.y = 0.035;
        setCleaningTool(null);
        return;
      }
      if (setInteriorCleaningPath(stop.position)) {
        cleaningPhase = "walking-to-stop";
      }
    };
    const beginCleaningDeparture = () => {
      for (const door of restroomDoors) door.manualTargetOpen = true;
      const exit = new THREE.Vector3(0, 0, 7.08);
      if (setInteriorCleaningPath(exit, true)) {
        cleaningPhase = "walking-to-exit";
      }
    };
    const startCleaningShift = (shiftKey: string) => {
      completedCleaningShifts.add(shiftKey);
      greetedThisShift.clear();
      activeCleaningVehicle =
        cleaningVehicles[Math.random() < 0.5 ? 0 : 1];
      for (const vehicle of cleaningVehicles) {
        vehicle.group.visible = vehicle === activeCleaningVehicle;
      }
      activeCleaningVehicle.progress = 0;
      activeCleaningVehicle.group.visible = true;
      moveCleaningServiceVehicle(activeCleaningVehicle, 0, 1);
      activeCleaningVehicle.group.updateMatrixWorld(true);
      activeCleaningVehicle.group.attach(cleaningActor.group);
      cleaningActor.group.visible = true;
      cleaningActor.group.position.set(0, 0.56, 0.12);
      cleaningActor.group.rotation.set(0, Math.PI, 0);
      cleaningActor.activity = "walking";
      cleaningActor.speed = 1.25 * movementSpeedMultiplier;
      cleaningActor.arms[0].rotation.x = 0.16;
      cleaningActor.arms[1].rotation.x = 0.16;
      cleaningActor.lowerArms[0].rotation.x = -0.48;
      cleaningActor.lowerArms[1].rotation.x = -0.48;
      cleaningActor.legs[0].rotation.x = -0.72;
      cleaningActor.legs[1].rotation.x = -0.72;
      cleaningActor.lowerLegs[0].rotation.x = 1.18;
      cleaningActor.lowerLegs[1].rotation.x = 1.18;
      cleaningStopIndex = 0;
      cleaningTaskIndex = 0;
      cleaningGreetingTime = 0;
      cleaningResumeTool = null;
      cleaningTaskTime = 0;
      cleaningPhase = "arriving";
      setCleaningTool(null);
    };
    const finishCleaningShift = () => {
      if (activeCleaningVehicle) activeCleaningVehicle.group.visible = false;
      floorplan.attach(cleaningActor.group);
      cleaningActor.group.visible = false;
      cleaningActor.path = [];
      cleaningActor.pathIndex = 0;
      cleaningActor.group.position.set(-12.5, 0.035, -9.45);
      cleaningActor.body.position.set(0, 0, 0);
      cleaningActor.body.rotation.set(0, 0, 0);
      cleaningActor.upperBody.rotation.set(0, 0, 0);
      cleaningActor.head.rotation.set(0, 0, 0);
      cleaningActor.neck.rotation.set(0, 0, 0);
      cleaningActor.legs.forEach((leg) => leg.rotation.set(0, 0, 0));
      cleaningActor.lowerLegs.forEach((leg) => leg.rotation.set(0, 0, 0));
      cleaningActor.arms.forEach((arm) => arm.rotation.set(0, 0, 0));
      cleaningActor.lowerArms.forEach((arm) => arm.rotation.set(0, 0, 0));
      for (const door of restroomDoors) door.manualTargetOpen = false;
      setCleaningTool(null);
      activeCleaningVehicle = null;
      cleaningPhase = "idle";
    };
    const moveCleaningActor = (delta: number) => {
      const target = cleaningActor.path[cleaningActor.pathIndex];
      if (!target) return true;
      const dx = target.x - cleaningActor.group.position.x;
      const dz = target.z - cleaningActor.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.09) {
        cleaningActor.group.position.x = target.x;
        cleaningActor.group.position.z = target.z;
        cleaningActor.pathIndex += 1;
        return cleaningActor.pathIndex >= cleaningActor.path.length;
      }
      const step = Math.min(distance, cleaningActor.speed * delta);
      const destination = new THREE.Vector3(
        cleaningActor.group.position.x + (dx / distance) * step,
        cleaningActor.group.position.y,
        cleaningActor.group.position.z + (dz / distance) * step,
      );
      const next = cleaningOutsidePath
        ? destination
        : moveWithCollisions(
            cleaningActor.group.position,
            destination,
            movementObstaclesForActor(cleaningActor),
            actorCollisionRadius,
          );
      cleaningActor.group.position.x = next.x;
      cleaningActor.group.position.z = next.z;
      const gaitPhase = elapsed * 8 + cleaningActor.offset;
      cleaningActor.group.position.y =
        0.035 + Math.abs(Math.sin(gaitPhase * 2)) * 0.018;
      cleaningActor.legs[0].rotation.x = Math.sin(gaitPhase) * 0.42;
      cleaningActor.legs[1].rotation.x = Math.sin(gaitPhase + Math.PI) * 0.42;
      cleaningActor.lowerLegs[0].rotation.x =
        Math.max(0, -Math.sin(gaitPhase)) * 0.48;
      cleaningActor.lowerLegs[1].rotation.x =
        Math.max(0, -Math.sin(gaitPhase + Math.PI)) * 0.48;
      cleaningActor.targetRotation = Math.atan2(dx, dz);
      cleaningActor.group.rotation.y = dampAngle(
        cleaningActor.group.rotation.y,
        cleaningActor.targetRotation,
        7,
        delta,
      );
      return false;
    };
    const updateCleaningAnimation = (delta: number) => {
      updateActorAnimation(cleaningActor, elapsed, delta);
      if (cleaningGreetingTime > 0) {
        cleaningActor.group.position.y = THREE.MathUtils.damp(
          cleaningActor.group.position.y,
          0.035,
          8,
          delta,
        );
        cleaningActor.legs.forEach((leg) => {
          leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, 0, 7, delta);
        });
        cleaningActor.lowerLegs.forEach((leg) => {
          leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, 0, 7, delta);
        });
        cleaningActor.arms[1].rotation.x = THREE.MathUtils.damp(
          cleaningActor.arms[1].rotation.x,
          -0.78,
          7,
          delta,
        );
        cleaningActor.arms[1].rotation.z = THREE.MathUtils.damp(
          cleaningActor.arms[1].rotation.z,
          0.24,
          7,
          delta,
        );
        cleaningActor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
          cleaningActor.lowerArms[1].rotation.x,
          -0.4 + Math.sin(elapsed * 8) * 0.25,
          8,
          delta,
        );
        return;
      }
      if (cleaningPhase === "arriving" || cleaningPhase === "departing") {
        cleaningActor.upperBody.rotation.x = THREE.MathUtils.damp(
          cleaningActor.upperBody.rotation.x,
          0.12,
          5,
          delta,
        );
        cleaningActor.arms.forEach((arm) => {
          arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, 0.22, 5, delta);
        });
        cleaningActor.lowerArms.forEach((arm) => {
          arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, -0.5, 5, delta);
        });
        cleaningActor.legs.forEach((leg, index) => {
          leg.rotation.x = THREE.MathUtils.damp(
            leg.rotation.x,
            -0.72 + Math.sin(elapsed * 5 + index) * 0.06,
            4,
            delta,
          );
        });
        cleaningActor.lowerLegs.forEach((leg) => {
          leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, 1.18, 5, delta);
        });
        return;
      }
      if (cleaningPhase === "admin-greeting") {
        cleaningActor.group.position.y = 0.035;
        cleaningActor.group.rotation.y = dampAngle(
          cleaningActor.group.rotation.y,
          cleaningActor.targetRotation,
          5,
          delta,
        );
        cleaningActor.upperBody.rotation.x = THREE.MathUtils.damp(
          cleaningActor.upperBody.rotation.x,
          0.35,
          5,
          delta,
        );
        cleaningActor.head.rotation.x = THREE.MathUtils.damp(
          cleaningActor.head.rotation.x,
          0.14,
          5,
          delta,
        );
        return;
      }
      const activeTask =
        cleaningPhase === "cleaning"
          ? cleaningStops[cleaningStopIndex]?.tasks[cleaningTaskIndex]
          : undefined;
      cleaningActor.group.position.y = THREE.MathUtils.damp(
        cleaningActor.group.position.y,
        0.035,
        7,
        delta,
      );
      cleaningActor.legs.forEach((leg) => {
        leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, 0, 6, delta);
      });
      cleaningActor.lowerLegs.forEach((leg) => {
        leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, 0, 6, delta);
      });
      const sweeping = activeTask?.tool === "broom" || activeTask?.tool === "mop";
      const watering = activeTask?.tool === "wateringCan";
      cleaningActor.upperBody.rotation.x = THREE.MathUtils.damp(
        cleaningActor.upperBody.rotation.x,
        sweeping ? 0.19 : watering ? 0.08 : 0.02,
        4,
        delta,
      );
      cleaningActor.arms[0].rotation.x = THREE.MathUtils.damp(
        cleaningActor.arms[0].rotation.x,
        sweeping ? -0.32 + Math.sin(elapsed * 3.8) * 0.11 : -0.25,
        5,
        delta,
      );
      cleaningActor.arms[1].rotation.x = THREE.MathUtils.damp(
        cleaningActor.arms[1].rotation.x,
        watering ? -0.74 : sweeping ? -0.43 : -0.48,
        5,
        delta,
      );
      cleaningActor.lowerArms[0].rotation.x = THREE.MathUtils.damp(
        cleaningActor.lowerArms[0].rotation.x,
        sweeping ? -0.78 + Math.sin(elapsed * 4.8) * 0.18 : -0.62,
        6,
        delta,
      );
      cleaningActor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
        cleaningActor.lowerArms[1].rotation.x,
        watering ? -1.02 : sweeping ? -0.92 : -0.84,
        6,
        delta,
      );
      if (cleaningCurrentTool === "broom" || cleaningCurrentTool === "mop") {
        const tool = cleaningActor.cleaningTools?.[cleaningCurrentTool];
        if (tool) {
          tool.rotation.z = Math.sin(elapsed * 4.8) * 0.12;
          tool.rotation.x = Math.sin(elapsed * 3.1) * 0.06;
        }
      }
      if (cleaningCurrentTool === "wateringCan") {
        const can = cleaningActor.cleaningTools?.wateringCan;
        if (can) can.rotation.x = 0.18 + Math.sin(elapsed * 2.8) * 0.045;
      }
      if (cleaningCurrentTool === "cloth") {
        cleaningActor.wrists[1].rotation.z =
          Math.sin(elapsed * 5.2) * 0.14;
      }
    };
    const updateCleaningService = (delta: number, timestamp: number) => {
      if (cleaningPhase === "idle") {
        if (timestamp >= cleaningScheduleCheckAt) {
          const dueShift = getDueCleaningShift(
            new Date(),
            completedCleaningShifts,
          );
          if (dueShift) startCleaningShift(dueShift.key);
          cleaningScheduleCheckAt = timestamp + 8_000;
        }
        return;
      }
      updateCleaningAnimation(delta);
      if (
        cleaningPhase !== "arriving" &&
        cleaningPhase !== "departing" &&
        cleaningPhase !== "admin-greeting" &&
        cleaningPhase !== "walking-to-exit" &&
        cleaningPhase !== "walking-out"
      ) {
        if (cleaningGreetingTime > 0) {
          cleaningActor.group.rotation.y = dampAngle(
            cleaningActor.group.rotation.y,
            cleaningActor.targetRotation,
            6,
            delta,
          );
          cleaningGreetingTime = Math.max(0, cleaningGreetingTime - delta);
          if (cleaningGreetingTime === 0) {
            cleaningActor.greetingUntil = undefined;
            setCleaningTool(cleaningResumeTool);
            cleaningResumeTool = null;
          }
          return;
        }
        const encountered =
          greetedThisShift.size < 4
            ? actors.find(
                (actor) =>
                  actor.username?.trim().toLowerCase() !== "dung0001" &&
                  !greetedThisShift.has(actor) &&
                  actor.group.position.distanceTo(cleaningActor.group.position) <
                    2.1,
              )
            : undefined;
        if (encountered) {
          greetedThisShift.add(encountered);
          cleaningGreetingTime = 1.55;
          cleaningResumeTool = cleaningCurrentTool;
          setCleaningTool(null);
          cleaningActor.greetingUntil = elapsed + cleaningGreetingTime;
          encountered.greetingUntil = elapsed + cleaningGreetingTime;
          const toColleague = encountered.group.position
            .clone()
            .sub(cleaningActor.group.position);
          cleaningActor.targetRotation = Math.atan2(toColleague.x, toColleague.z);
          const toCleaner = cleaningActor.group.position
            .clone()
            .sub(encountered.group.position);
          encountered.targetRotation = Math.atan2(toCleaner.x, toCleaner.z);
          return;
        }
      }
      if (cleaningPhase === "arriving" && activeCleaningVehicle) {
        if (moveCleaningServiceVehicle(activeCleaningVehicle, delta, 1)) {
          floorplan.attach(cleaningActor.group);
          cleaningActor.group.position.set(-12.5, 0.035, -9.45);
          cleaningActor.group.rotation.y = 0;
          cleaningActor.activity = "walking";
          setExteriorWalkInPath();
        }
        return;
      }
      if (cleaningPhase === "walking-in") {
        if (moveCleaningActor(delta)) {
          cleaningOutsidePath = false;
          startCleaningStop(0);
        }
        return;
      }
      if (cleaningPhase === "opening-restroom") {
        if (restroomDoors.every((door) => door.openAmount > 0.97)) {
          if (setInteriorCleaningPath(cleaningStops[cleaningStopIndex].position)) {
            cleaningPhase = "walking-to-stop";
          }
        }
        return;
      }
      if (
        cleaningPhase === "walking-to-stop" ||
        cleaningPhase === "walking-to-exit" ||
        cleaningPhase === "walking-out"
      ) {
        if (!moveCleaningActor(delta)) return;
        if (cleaningPhase === "walking-to-stop") {
          const stop = cleaningStops[cleaningStopIndex];
          if (stop.id === "administration") {
            cleaningPhase = "admin-greeting";
            cleaningActor.activity = "working";
            cleaningTaskTime = 2.2;
            const administrator = actors.find(
              (actor) => actor.username?.trim().toLowerCase() === "dung0001",
            );
            if (
              administrator &&
              administrator.group.position.distanceTo(cleaningActor.group.position) < 3.2
            ) {
              administrator.adminGreetingUntil = elapsed + 1.7;
              const toAdministrator = administrator.group.position
                .clone()
                .sub(cleaningActor.group.position);
              cleaningActor.targetRotation = Math.atan2(
                toAdministrator.x,
                toAdministrator.z,
              );
              const toCleaner = cleaningActor.group.position
                .clone()
                .sub(administrator.group.position);
              administrator.targetRotation = Math.atan2(toCleaner.x, toCleaner.z);
            }
          } else {
            cleaningPhase = "cleaning";
            cleaningActor.activity = "working";
            cleaningTaskIndex = 0;
            cleaningTaskTime = 0;
          }
        } else if (cleaningPhase === "walking-to-exit") {
          for (const door of restroomDoors) door.manualTargetOpen = false;
          setCleaningPath(
            [
              new THREE.Vector3(0, 0, 7.08),
              new THREE.Vector3(0, 0, 8.7),
              new THREE.Vector3(-2, 0, 8.72),
              new THREE.Vector3(-6, 0, 8.72),
              new THREE.Vector3(-10.2, 0, 8.55),
              new THREE.Vector3(-12.5, 0, 7.2),
              new THREE.Vector3(-12.5, 0, 2),
              new THREE.Vector3(-12.5, 0, -4.5),
              new THREE.Vector3(-12.5, 0, -9.45),
            ],
            true,
          );
          cleaningPhase = "walking-out";
        } else if (activeCleaningVehicle) {
          activeCleaningVehicle.group.updateMatrixWorld(true);
          activeCleaningVehicle.group.attach(cleaningActor.group);
          cleaningActor.group.position.set(0, 0.56, 0.12);
          cleaningActor.group.rotation.set(0, Math.PI, 0);
          cleaningPhase = "departing";
        }
        return;
      }
      if (cleaningPhase === "admin-greeting") {
        cleaningTaskTime -= delta;
        if (cleaningTaskTime <= 0) {
          cleaningPhase = "cleaning";
          cleaningTaskIndex = 0;
          cleaningTaskTime = 0;
        }
        return;
      }
      if (cleaningPhase === "cleaning") {
        const stop = cleaningStops[cleaningStopIndex];
        const task = stop?.tasks[cleaningTaskIndex];
        if (!task) {
          setCleaningTool(null);
          if (cleaningStopIndex >= cleaningStops.length - 1) {
            beginCleaningDeparture();
          } else {
            startCleaningStop(cleaningStopIndex + 1);
          }
          return;
        }
        if (cleaningTaskTime <= 0) {
          cleaningTaskTime = task.duration;
          setCleaningTool(task.tool);
          cleaningActor.targetRotation = task.rotation;
        }
        cleaningTaskTime -= delta;
        if (cleaningTaskTime <= 0) {
          cleaningTaskIndex += 1;
          cleaningTaskTime = 0;
        }
      } else if (cleaningPhase === "departing" && activeCleaningVehicle) {
        if (moveCleaningServiceVehicle(activeCleaningVehicle, delta, -1)) {
          finishCleaningShift();
        }
      }
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    raycasterRef.current = raycaster;
    pointerRef.current = pointer;

    let frameId = 0;
    let lastLightingUpdate = 0;
    let lastFrameTime = performance.now();
    const cameraSide = new THREE.Vector3();
    const cameraOffsetScratch = new THREE.Vector3();
    const deliveryPosition = new THREE.Vector3();
    const deliveryDirection = new THREE.Vector3();
    const deliveryToShipper = new THREE.Vector3();
    const deliveryToActor = new THREE.Vector3();
    const cameraTargetPosition = new THREE.Vector3();
    const cameraShift = new THREE.Vector3();
    const compassArrow = host.querySelector<HTMLElement>(
      ".office-scene__compass i",
    );
    let elapsed = 0;
    let lastPublishedStatusKey = "";
    let publishingStatus = false;
    let publishingSnapshot = false;
    let nextStatusPublishAt = 0;
    let nextPresenceCheckAt = 0;
    let simulationAuthority = true;
    let liveChannelSubscribed = false;
    let latestRemoteSnapshot: OfficeLiveSnapshot | null = null;
    let lastLiveBroadcastAt = 0;
    let liveConnection: LiveOfficeConnection | null = null;
    let pendingBirdCalls = 0;
    const pendingMotorcycleCalls: boolean[] = [];
    const liveSceneEntities = [
      ...vehicles.map((vehicle, index) => ({
        id: `car:${index}`,
        group: vehicle.group,
        opacityMaterials: vehicle.opacityMaterials,
      })),
      ...motorcycles.flatMap((motorcycle, index) => [
        {
          id: `motorcycle:${index}`,
          group: motorcycle.group,
          opacityMaterials: motorcycle.opacityMaterials,
        },
        {
          id: `police:${index}`,
          group: motorcycle.policeGroup,
          opacityMaterials: motorcycle.policeOpacityMaterials,
        },
      ]),
      {
        id: "courier",
        group: deliveryShipper.group,
        opacityMaterials: deliveryShipper.opacityMaterials,
      },
      ...birds.map((bird, index) => ({
        id: `bird:${index}`,
        group: bird.group,
        opacityMaterials: bird.opacityMaterials,
      })),
    ];
    const liveSceneEntitiesById = new Map(
      liveSceneEntities.map((entity) => [entity.id, entity]),
    );
    const actorsByUsername = new Map<string, Actor>();
    for (const actor of actors) {
      if (actor.username) {
        actorsByUsername.set(actor.username.toLowerCase(), actor);
      }
    }
    let applyLatestSnapshotOnAuthorityChange: (() => void) | null = null;
    if (!localControlSimulation) {
      const liveClientId = crypto.randomUUID();
      const electSimulationAuthority = () => {
        if (!liveChannelSubscribed || !liveConnection) return;
        const clientIds = liveConnection.getPresenceClientIds();
        const wasAuthority = simulationAuthority;
        const selfPresent = clientIds.includes(liveClientId);
        simulationAuthority =
          !selfPresent || clientIds[0] === liveClientId;
        if (simulationAuthority && !wasAuthority) {
          applyLatestSnapshotOnAuthorityChange?.();
        }
      };
      try {
        liveConnection = connectLiveOffice(liveClientId, currentUserId, {
          onPresenceSync: electSimulationAuthority,
          onSnapshot: (payload) => {
            const snapshot = parseOfficeLiveSnapshot(payload);
            if (
              snapshot &&
              (!latestRemoteSnapshot ||
                snapshot.capturedAt >= latestRemoteSnapshot.capturedAt)
            ) {
              latestRemoteSnapshot = snapshot;
            }
          },
          onStatus: (status) => {
            if (status === "SUBSCRIBED") {
              liveChannelSubscribed = true;
              setOfficeRealtimeError(null);
              lastLiveBroadcastAt = 0;
              electSimulationAuthority();
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              liveChannelSubscribed = false;
              simulationAuthority = true;
              setOfficeRealtimeError(
                "Live office position sharing is unavailable. Apply the office realtime policies in Supabase.",
              );
            }
          },
          onTrackError: (cause) => {
            liveChannelSubscribed = false;
            simulationAuthority = true;
            setOfficeRealtimeError(getOfficeControlErrorMessage(cause));
          },
        });
      } catch (cause) {
        simulationAuthority = true;
        queueMicrotask(() =>
          setOfficeRealtimeError(getOfficeControlErrorMessage(cause)),
        );
      }
    }
    const captureLiveSnapshot = (): OfficeLiveSnapshot => ({
      capturedAt: Date.now(),
      actors: actors.flatMap((actor) =>
        actor.username
          ? [
              {
                username: actor.username,
                x: actor.group.position.x,
                y: actor.group.position.y,
                z: actor.group.position.z,
                rotation: actor.group.rotation.y,
                activity: actor.activity,
                deliveryTask: actor.deliveryTask,
                isWatchingAquarium: actor.isWatchingAquarium,
                zone:
                  activitySpots.find((spot) => spot.id === actor.goalSpotId)
                    ?.zoneId ?? null,
                phoneVisible: actor.phone.visible,
                packageVisible: actor.carriedPackage.visible,
              },
            ]
          : [],
      ),
      objects: liveSceneEntities.map((entity) => ({
        id: entity.id,
        x: entity.group.position.x,
        y: entity.group.position.y,
        z: entity.group.position.z,
        rotation: entity.group.rotation.y,
        visible: entity.group.visible,
        opacity: entity.opacityMaterials[0]?.opacity ?? 1,
      })),
      courier: {
        phase: deliveryShipper.phase,
        recipientUsername: deliveryShipper.recipient?.username ?? null,
        phoneVisible: deliveryShipper.phone.visible,
        packageVisible: deliveryShipper.package.visible,
        kickstandVisible: deliveryShipper.kickstand.visible,
        riderHeight: deliveryShipper.rider.position.y,
      },
    });
    const applyRemoteSnapshot = (delta: number) => {
      const snapshot = latestRemoteSnapshot;
      if (!snapshot) return;
      for (const remoteActor of snapshot.actors) {
        const actor = actorsByUsername.get(remoteActor.username.toLowerCase());
        if (!actor) continue;
        actor.group.position.x = THREE.MathUtils.damp(
          actor.group.position.x,
          remoteActor.x,
          14,
          delta,
        );
        actor.group.position.y = THREE.MathUtils.damp(
          actor.group.position.y,
          remoteActor.y,
          14,
          delta,
        );
        actor.group.position.z = THREE.MathUtils.damp(
          actor.group.position.z,
          remoteActor.z,
          14,
          delta,
        );
        actor.group.rotation.y = dampAngle(
          actor.group.rotation.y,
          remoteActor.rotation,
          14,
          delta,
        );
        actor.activity = remoteActor.activity;
        actor.isWatchingAquarium = remoteActor.isWatchingAquarium ?? false;
        actor.deliveryTask = remoteActor.deliveryTask;
        actor.phone.visible = remoteActor.phoneVisible;
        actor.carriedPackage.visible = remoteActor.packageVisible;
        actor.sleepIndicator.visible = remoteActor.activity === "sleeping";
      }
      for (const remoteObject of snapshot.objects) {
        const entity = liveSceneEntitiesById.get(remoteObject.id);
        if (!entity) continue;
        entity.group.position.x = THREE.MathUtils.damp(
          entity.group.position.x,
          remoteObject.x,
          14,
          delta,
        );
        entity.group.position.y = THREE.MathUtils.damp(
          entity.group.position.y,
          remoteObject.y,
          14,
          delta,
        );
        entity.group.position.z = THREE.MathUtils.damp(
          entity.group.position.z,
          remoteObject.z,
          14,
          delta,
        );
        entity.group.rotation.y = dampAngle(
          entity.group.rotation.y,
          remoteObject.rotation,
          14,
          delta,
        );
        entity.group.visible = remoteObject.visible;
        entity.opacityMaterials.forEach((material) => {
          material.opacity = remoteObject.opacity;
        });
      }
      deliveryShipper.phase = snapshot.courier.phase;
      deliveryShipper.recipient =
        snapshot.courier.recipientUsername === null
          ? null
          : actorsByUsername.get(
              snapshot.courier.recipientUsername.toLowerCase(),
            ) ?? null;
      deliveryShipper.phone.visible = snapshot.courier.phoneVisible;
      deliveryShipper.package.visible = snapshot.courier.packageVisible;
      deliveryShipper.kickstand.visible = snapshot.courier.kickstandVisible;
      deliveryShipper.rider.position.y = THREE.MathUtils.damp(
        deliveryShipper.rider.position.y,
        snapshot.courier.riderHeight,
        14,
        delta,
      );
    };
    applyLatestSnapshotOnAuthorityChange = () => {
      if (latestRemoteSnapshot) applyRemoteSnapshot(1);
    };
    const updateLabelOpacity = (label: THREE.Sprite, opacity: number) => {
      const baseOpacity = label.userData.baseOpacity;
      if (typeof baseOpacity !== "number") {
        label.userData.baseOpacity = label.material.opacity;
      }
      const targetOpacity =
        (typeof baseOpacity === "number" ? baseOpacity : label.material.opacity) *
        opacity;
      if (Math.abs(label.material.opacity - targetOpacity) > 0.001) {
        label.material.opacity = targetOpacity;
      }
      const visible = opacity > 0.001 || sceneLabelsTargetOpacityRef.current > 0;
      if (label.visible !== visible) label.visible = visible;
    };
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const viewHeight =
        (aspect < 0.9 ? 31 : aspect < 1.25 ? 29.5 : 27.5) * officeScale;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };
    const animate = (timestamp: number) => {
      if (document.hidden) {
        frameId = 0;
        return;
      }
      frameId = window.requestAnimationFrame(animate);
      const frameTimeMs = timestamp - lastFrameTime;
      const delta = clampAnimationDelta(frameTimeMs / 1000);
      const currentTime = timestamp;
      elapsed += delta;
      lastFrameTime = timestamp;
      for (const fogLayer of roadFogLayers) {
        for (let index = 0; index < fogLayer.basePositions.length; index += 1) {
          const drift = elapsed * 0.16 + fogLayer.phases[index];
          const basePosition = fogLayer.basePositions[index];
          const baseScale = fogLayer.baseScales[index];
          const breathing = 1 + Math.sin(drift * 0.58) * 0.035;
          fogTransform.position.set(
            basePosition.x +
              Math.sin(drift) * 0.3 * fogLayer.driftDirections[index],
            basePosition.y + Math.sin(drift * 0.72) * 0.14,
            basePosition.z + Math.cos(drift * 0.58) * 0.42,
          );
          fogTransform.rotation.y = Math.PI / 2;
          fogTransform.scale.set(
            baseScale.x * breathing,
            baseScale.y * breathing,
            1,
          );
          fogTransform.updateMatrix();
          fogLayer.mesh.setMatrixAt(index, fogTransform.matrix);
        }
        fogLayer.mesh.instanceMatrix.needsUpdate = true;
        const opacityPulse = Math.sin(elapsed * 0.13 + fogLayer.phases[0]);
        fogLayer.material.opacity =
          fogLayer.baseOpacity * (0.86 + opacityPulse * 0.14);
      }
      sceneLabelsOpacityRef.current = THREE.MathUtils.damp(
        sceneLabelsOpacityRef.current,
        sceneLabelsTargetOpacityRef.current,
        8,
        delta,
      );
      const labelOpacity = sceneLabelsOpacityRef.current;
      for (const label of actorLabelsRef.current) {
        updateLabelOpacity(label, labelOpacity);
      }
      for (const label of roomLabelsRef.current) {
        updateLabelOpacity(label, labelOpacity);
      }
      if (simulationAuthority || localControlSimulation) {
      applySharedOfficeControls();
      while (localSceneEffectQueueRef.current.length > 0) {
        const action = localSceneEffectQueueRef.current.shift();
        if (action === "summon_bird") pendingBirdCalls += 1;
        if (action === "summon_motorcycle") {
          pendingMotorcycleCalls.push(false);
        }
        if (action === "summon_police_motorcycle") {
          pendingMotorcycleCalls.push(true);
        }
      }
      while (pendingBirdCalls > 0) {
        const bird = birds.find((candidate) => !candidate.group.visible) ?? birds[0];
        const { start, heading } = randomSummonedBirdApproach();
        bird.route = createBirdFlightRoute(
          start,
          heading,
          false,
          randomBetween(34, 44),
        );
        bird.progress = 0;
        bird.exiting = false;
        bird.segmentsRemaining = 4 + Math.floor(Math.random() * 5);
        bird.group.visible = true;
        pendingBirdCalls -= 1;
      }
      updateRoadTraffic(
        vehicles,
        trafficStates,
        trafficSpeeds,
        delta,
        currentNightFactor,
      );
      shipperObstacleState.positionX = deliveryShipper.group.position.x;
      shipperObstacleState.positionZ = deliveryShipper.group.position.z;
      shipperObstacleState.active =
        deliveryShipper.group.visible &&
        deliveryShipper.phase !== "idle";
      updateRoadMotorcycles(
        motorcycles,
        trafficStates,
        pendingMotorcycleCalls,
        shipperObstacleState,
        delta,
        currentNightFactor,
        elapsed,
      );
      updateCleaningService(delta, timestamp);
      if (deliveryShipper.phase === "idle" && !meetingSessionActive) {
        deliveryShipper.respawnTime -= delta;
        if (deliveryShipper.respawnTime <= 0) {
          const recipient = shuffleItems(actors).find(
            isEligibleDeliveryActor,
          );
          if (recipient) {
            deliveryShipper.recipient = recipient;
            deliveryShipper.phase = "actor_call";
            const wasWalking = recipient.activity === "walking";
            releaseCurrentSpot(recipient);
            recipient.goalSpotId = null;
            recipient.goalObstacleId = undefined;
            recipient.currentObstacleId = undefined;
            recipient.currentSeatPosition = undefined;
            recipient.path = [];
            recipient.pathIndex = 0;
            if (wasWalking) recipient.activity = "chatting";
            recipient.deliveryTask = "calling";
            recipient.activityTime = 5;
            recipient.phone.visible = true;
            recipient.currentAction = null;
            if (recipient.activity === "sleeping") {
              recipient.activity = "working";
              recipient.sleepIndicator.visible = false;
            }
          } else {
            deliveryShipper.respawnTime = 12;
          }
        }
      }
      if (deliveryShipper.phase === "approaching") {
        deliveryShipper.progress +=
          (2.8 * movementSpeedMultiplier * delta) /
          deliveryShipper.approachRouteLength;
        if (deliveryShipper.progress >= 1) {
          deliveryShipper.progress = 1;
          deliveryShipper.phase = "calling";
          deliveryShipper.waitTime = 0;
          deliveryShipper.retryTime = 0;
          deliveryShipper.kickstand.visible = true;
          deliveryShipper.phone.visible = false;
          deliveryShipper.package.visible = true;
          deliveryShipper.packageInTransfer = false;
          deliveryShipper.packageHandedOff = false;
          deliveryShipper.opacityMaterials.forEach((material) => {
            material.opacity = 1;
          });
        } else {
          deliveryShipper.opacityMaterials.forEach((material) => {
            material.opacity = progressOpacity(
              deliveryShipper.progress,
              0.08,
              1,
            );
          });
        }
        const position = deliveryShipper.approachRoute.getPointAt(
          deliveryShipper.progress,
          deliveryPosition,
        );
        const direction = deliveryShipper.approachRoute
          .getTangentAt(deliveryShipper.progress, deliveryDirection)
          .normalize();
        deliveryShipper.group.position.copy(position);
        deliveryShipper.group.rotation.y = Math.atan2(
          -direction.x,
          -direction.z,
        );
      } else if (
        deliveryShipper.phase === "calling" ||
        deliveryShipper.phase === "waiting_actor" ||
        deliveryShipper.phase === "pickup" ||
        deliveryShipper.phase === "mounting"
      ) {
        deliveryShipper.waitTime += delta;
        const position = deliveryShipper.approachRoute.getPointAt(
          1,
          deliveryPosition,
        );
        const direction = deliveryShipper.approachRoute
          .getTangentAt(1, deliveryDirection)
          .normalize();
        deliveryShipper.group.position.copy(position);
        if (
          deliveryShipper.phase !== "waiting_actor" ||
          deliveryShipper.recipient?.deliveryTask !== "waiting"
        ) {
          deliveryShipper.group.rotation.y = Math.atan2(
            -direction.x,
            -direction.z,
          );
        }
        if (deliveryShipper.phase === "calling") {
          deliveryShipper.phone.visible = deliveryShipper.waitTime >= 0.9;
          deliveryShipper.kickstand.visible = true;
          deliveryShipper.rider.position.x = THREE.MathUtils.damp(
            deliveryShipper.rider.position.x,
            -0.98,
            5,
            delta,
          );
          deliveryShipper.rider.position.y = THREE.MathUtils.damp(
            deliveryShipper.rider.position.y,
            0.4,
            5,
            delta,
          );
          deliveryShipper.rider.position.z = THREE.MathUtils.damp(
            deliveryShipper.rider.position.z,
            0.12,
            5,
            delta,
          );
          if (deliveryShipper.waitTime >= 5) {
            if (
              deliveryShipper.recipient &&
              sendActorToDelivery(deliveryShipper.recipient)
            ) {
              deliveryShipper.phase = "waiting_actor";
              deliveryShipper.waitTime = 0;
            } else if (deliveryShipper.recipient) {
              cancelDeliveryForActor(deliveryShipper.recipient);
            } else {
              deliveryShipper.phase = "departing";
              deliveryShipper.progress = 0;
            }
          }
        } else if (deliveryShipper.phase === "waiting_actor") {
          deliveryShipper.phone.visible = true;
          deliveryShipper.kickstand.visible = true;
          const recipient = deliveryShipper.recipient;
          if (recipient?.deliveryTask === "waiting") {
            const toShipper = deliveryToShipper
              .copy(position)
              .sub(recipient.group.position);
            const toActor = deliveryToActor
              .copy(recipient.group.position)
              .sub(position);
            const shipperTargetRotation = Math.atan2(
              -toActor.x,
              -toActor.z,
            );
            deliveryShipper.group.rotation.y = dampAngle(
              deliveryShipper.group.rotation.y,
              shipperTargetRotation,
              5,
              delta,
            );
            const riderHeading = Math.atan2(toActor.x, toActor.z);
            deliveryShipper.rider.rotation.y = dampAngle(
              deliveryShipper.rider.rotation.y,
              riderHeading -
                deliveryShipper.group.rotation.y -
                Math.PI,
              5,
              delta,
            );
            recipient.targetRotation = Math.atan2(toShipper.x, toShipper.z);
            const facingDifference = Math.atan2(
              Math.sin(recipient.targetRotation - recipient.group.rotation.y),
              Math.cos(recipient.targetRotation - recipient.group.rotation.y),
            );
            const shipperFacingDifference = Math.atan2(
              Math.sin(
                shipperTargetRotation - deliveryShipper.group.rotation.y,
              ),
              Math.cos(
                shipperTargetRotation - deliveryShipper.group.rotation.y,
              ),
            );
            if (
              toShipper.length() <= 1.65 &&
              Math.abs(facingDifference) <= 0.1 &&
              Math.abs(shipperFacingDifference) <= 0.1
            ) {
              deliveryShipper.phase = "pickup";
              deliveryShipper.waitTime = 0;
              deliveryShipper.packageHandedOff = false;
              deliveryShipper.package.updateWorldMatrix(true, false);
              deliveryShipper.package.getWorldPosition(
                deliveryShipper.packageStartPosition,
              );
              scene.attach(deliveryShipper.package);
              deliveryShipper.packageInTransfer = true;
              recipient.group.updateMatrixWorld(true);
              recipient.carriedPackage.getWorldPosition(
                deliveryShipper.packageTargetPosition,
              );
              deliveryShipper.phone.visible = false;
              recipient.deliveryTask = "pickup";
              recipient.activityTime = 2.5;
              recipient.actionTime = 0;
            }
          }
        } else if (deliveryShipper.phase === "pickup") {
          deliveryShipper.phone.visible = false;
          deliveryShipper.kickstand.visible = true;
          if (deliveryShipper.packageInTransfer) {
            const recipient = deliveryShipper.recipient;
            if (recipient) {
              recipient.group.updateMatrixWorld(true);
              recipient.carriedPackage.getWorldPosition(
                deliveryShipper.packageTargetPosition,
              );
              const transferProgress = THREE.MathUtils.smoothstep(
                deliveryShipper.waitTime,
                0,
                1.65,
              );
              deliveryShipper.package.position.lerpVectors(
                deliveryShipper.packageStartPosition,
                deliveryShipper.packageTargetPosition,
                transferProgress,
              );
              if (transferProgress >= 1) {
                deliveryShipper.package.visible = false;
                deliveryShipper.packageInTransfer = false;
                deliveryShipper.packageHandedOff = true;
                recipient.carriedPackage.visible = true;
              }
            }
          }
        } else {
          deliveryShipper.phone.visible = false;
          deliveryShipper.rider.position.x = THREE.MathUtils.damp(
            deliveryShipper.rider.position.x,
            0,
            4,
            delta,
          );
          deliveryShipper.rider.position.y = THREE.MathUtils.damp(
            deliveryShipper.rider.position.y,
            0.4,
            4,
            delta,
          );
          deliveryShipper.rider.position.z = THREE.MathUtils.damp(
            deliveryShipper.rider.position.z,
            0.1,
            4,
            delta,
          );
          deliveryShipper.rider.rotation.y = dampAngle(
            deliveryShipper.rider.rotation.y,
            0,
            4,
            delta,
          );
          deliveryShipper.kickstand.visible = deliveryShipper.waitTime < 0.7;
          if (deliveryShipper.waitTime >= 1.9) {
            deliveryShipper.phase = "departing";
            deliveryShipper.progress = 0;
          }
        }
      } else if (deliveryShipper.phase === "departing") {
        deliveryShipper.progress +=
          (3.2 * movementSpeedMultiplier * delta) /
          deliveryShipper.departureRouteLength;
        if (deliveryShipper.progress >= 1) {
          deliveryShipper.group.visible = false;
          deliveryShipper.phase = "idle";
          deliveryShipper.recipient = null;
          deliveryShipper.respawnTime = 55 + Math.random() * 65;
        } else {
          const position = deliveryShipper.departureRoute.getPointAt(
            deliveryShipper.progress,
            deliveryPosition,
          );
          const direction = deliveryShipper.departureRoute
            .getTangentAt(deliveryShipper.progress, deliveryDirection)
            .normalize();
          deliveryShipper.group.position.copy(position);
          deliveryShipper.group.rotation.y = Math.atan2(
            -direction.x,
            -direction.z,
          );
          const opacity = progressOpacity(
            deliveryShipper.progress,
            0.02,
            0.8,
          );
          deliveryShipper.opacityMaterials.forEach((material) => {
            material.opacity = opacity;
          });
        }
      }
      const courierIsMoving =
        deliveryShipper.group.visible &&
        (deliveryShipper.phase === "approaching" ||
          deliveryShipper.phase === "departing");
      deliveryShipper.headlight.intensity = courierIsMoving
        ? currentNightFactor * 34
        : 0;
      deliveryShipper.headlightMaterial.emissiveIntensity = courierIsMoving
        ? currentNightFactor * 2.8
        : 0;
      const courierMountProgress =
        deliveryShipper.phase === "mounting"
          ? THREE.MathUtils.smoothstep(deliveryShipper.waitTime, 0, 1.9)
          : deliveryShipper.phase === "approaching" ||
              deliveryShipper.phase === "departing"
            ? 1
            : 0;
      const courierDismounting =
        deliveryShipper.phase === "calling" &&
        deliveryShipper.waitTime < 1.45;
      const courierHandover = deliveryShipper.phase === "pickup";
      const courierInteracting =
        deliveryShipper.phase === "waiting_actor" || courierHandover;
      deliveryShipper.riderUpperBody.rotation.x = THREE.MathUtils.damp(
        deliveryShipper.riderUpperBody.rotation.x,
        courierHandover ? -0.1 : courierDismounting ? -0.06 : 0.13,
        4.5,
        delta,
      );
      deliveryShipper.riderHead.rotation.x = THREE.MathUtils.damp(
        deliveryShipper.riderHead.rotation.x,
        courierHandover ? 0.08 : deliveryShipper.phase === "calling" ? 0.1 : 0,
        3.5,
        delta,
      );
      deliveryShipper.riderHead.rotation.y = THREE.MathUtils.damp(
        deliveryShipper.riderHead.rotation.y,
        courierInteracting
          ? Math.sin(elapsed * 1.8 + deliveryShipper.waitTime) * 0.07
          : Math.sin(elapsed * 0.7) * 0.02,
        courierInteracting ? 2.8 : 2,
        delta,
      );
      for (let armIndex = 0; armIndex < 2; armIndex += 1) {
        const arm = deliveryShipper.riderArms[armIndex];
        const lowerArm = deliveryShipper.riderLowerArms[armIndex];
        const standingArmTarget =
          courierHandover
            ? -0.58
            : armIndex === 1 &&
                (deliveryShipper.phase === "calling" ||
                  deliveryShipper.phase === "waiting_actor")
              ? -0.34
              : 0.12;
        const ridingArmTarget = armIndex === 1 ? 0.18 : -0.18;
        arm.rotation.x = THREE.MathUtils.damp(
          arm.rotation.x,
          THREE.MathUtils.lerp(
            standingArmTarget,
            ridingArmTarget,
            courierMountProgress,
          ),
          6,
          delta,
        );
        const standingElbowTarget =
          courierHandover
            ? -0.78
            : armIndex === 1 &&
                (deliveryShipper.phase === "calling" ||
                  deliveryShipper.phase === "waiting_actor")
              ? -1.32
              : 0.08;
        lowerArm.rotation.x = THREE.MathUtils.damp(
          lowerArm.rotation.x,
          THREE.MathUtils.lerp(standingElbowTarget, -0.45, courierMountProgress),
          7,
          delta,
        );
        const dismountStep =
          courierDismounting
            ? Math.sin(deliveryShipper.waitTime * 8 + armIndex * Math.PI) *
              (1 - deliveryShipper.waitTime / 1.45) *
              0.34
            : 0;
        deliveryShipper.riderLegs[armIndex].rotation.x = THREE.MathUtils.damp(
          deliveryShipper.riderLegs[armIndex].rotation.x,
          THREE.MathUtils.lerp(0, -0.35, courierMountProgress) + dismountStep,
          5,
          delta,
        );
        deliveryShipper.riderLowerLegs[armIndex].rotation.x =
          THREE.MathUtils.damp(
            deliveryShipper.riderLowerLegs[armIndex].rotation.x,
            THREE.MathUtils.lerp(0, 0.75, courierMountProgress) -
              Math.max(0, dismountStep) * 0.6,
            5,
            delta,
          );
      }
      const courierLeanTarget = courierDismounting
        ? -0.08
        : deliveryShipper.phase === "mounting" &&
            deliveryShipper.waitTime < 0.9
          ? 0.1
          : 0;
      deliveryShipper.rider.rotation.z = THREE.MathUtils.damp(
        deliveryShipper.rider.rotation.z,
        courierLeanTarget,
        4,
        delta,
      );
      for (const bird of birds) {
        if (!bird.group.visible) {
          bird.respawnTime -= delta;
          if (bird.respawnTime <= 0) {
            bird.group.visible = true;
            bird.progress = 0;
            bird.exiting = false;
            bird.segmentsRemaining = 4 + Math.floor(Math.random() * 5);
            bird.route = createBirdFlightRoute(
              randomBirdPosition(),
              new THREE.Vector3(
                randomBetween(-1, 1),
                randomBetween(-0.2, 0.2),
                randomBetween(-0.7, 0.7),
              ).normalize(),
            );
          } else {
            continue;
          }
        }
        bird.progress += (bird.speed * delta) / bird.route.getLength();
        const position = bird.route.getPointAt(
          Math.min(bird.progress, 1),
          bird.positionScratch,
        );
        const opacity = bird.exiting
          ? getFlightBoundaryOpacity(
              position,
              birdFlightBounds,
              10,
            )
          : 1;
        bird.opacityMaterials.forEach((material) => {
          material.opacity = opacity;
        });
        if (bird.progress >= 1) {
          if (bird.exiting) {
            bird.group.visible = false;
            bird.respawnTime = 15 + Math.random() * 35;
          } else {
            const end = bird.route.getPointAt(1, bird.positionScratch);
            const heading = bird.route
              .getTangentAt(1, bird.directionScratch)
              .normalize();
            const desiredHeading = new THREE.Vector3(
              randomBetween(-1, 1),
              randomBetween(-0.2, 0.2),
              randomBetween(-0.7, 0.7),
            ).normalize();
            const nextHeading = limitFlightDirectionTurn(
              heading,
              desiredHeading,
              THREE.MathUtils.degToRad(30),
            );
            bird.directionScratch.set(
              nextHeading.x,
              nextHeading.y,
              nextHeading.z,
            );
            bird.segmentsRemaining -= 1;
            bird.exiting = bird.segmentsRemaining <= 0;
            bird.route = createBirdFlightRoute(
              end,
              bird.directionScratch,
              bird.exiting,
            );
            bird.progress = 0;
          }
          continue;
        }
        const direction = bird.route
          .getTangentAt(bird.progress, bird.directionScratch)
          .normalize();
        bird.group.position.copy(position);
        bird.group.rotation.y = Math.atan2(-direction.x, -direction.z);
        const flap = Math.sin(elapsed * 10 + bird.phase) * 0.52;
        bird.wings[0].rotation.z = -flap;
        bird.wings[1].rotation.z = flap;
      }
      }
      if (elapsed - lastLightingUpdate >= 1) {
        updateRealTimeLighting(new Date());
        lastLightingUpdate = elapsed;
      }
      if (!simulationAuthority && !localControlSimulation) {
        applyRemoteSnapshot(delta);
        for (const vehicle of vehicles) {
          const opacity = vehicle.opacityMaterials[0]?.opacity ?? 1;
          vehicle.headlights.forEach((headlight) => {
            headlight.intensity = currentNightFactor * 26 * opacity;
          });
          vehicle.headlightMaterials.forEach((material) => {
            material.emissiveIntensity = currentNightFactor * 3 * opacity;
          });
        }
        for (const motorcycle of motorcycles) {
          const opacity = motorcycle.opacityMaterials[0]?.opacity ?? 1;
          motorcycle.headlight.intensity = currentNightFactor * 55 * opacity;
          motorcycle.headlightMaterial.emissiveIntensity =
            currentNightFactor * 2.8 * opacity;
          updateMotorcycleEmergencyLights(motorcycle, elapsed, true);
        }
        birds.forEach((bird) => {
          const flap = Math.sin(elapsed * 10 + bird.phase) * 0.52;
          bird.wings[0].rotation.z = -flap;
          bird.wings[1].rotation.z = flap;
        });
      }
      if (
        !localControlSimulation &&
        localUsername &&
        currentTime >= nextPresenceCheckAt
      ) {
        nextPresenceCheckAt = currentTime + 500;
        const localActor = actorsByUsername.get(localUsername);
        const remoteActor = latestRemoteSnapshot?.actors.find(
          (actor) => actor.username.trim().toLowerCase() === localUsername,
        );
        if (
          localActor &&
          (simulationAuthority || remoteActor) &&
          Date.now() >= nextStatusPublishAt
        ) {
          const currentSpot = activitySpots.find(
            (spot) => spot.id === localActor.goalSpotId,
          );
          const zone = simulationAuthority
            ? currentSpot?.zoneId ?? null
            : remoteActor?.zone ?? null;
          const presence = getOfficeActivityPresence({
            activity: localActor.activity,
            deliveryTask: localActor.deliveryTask,
            isMeetingParticipant: localActor.isMeetingParticipant,
            manualControlAction: localActor.manualControlAction,
            reportingToAdmin: localActor.reportingToAdmin,
            zone,
          });
          const statusKey = `${presence.status}:${presence.detail}:${zone ?? ""}`;
          if (statusKey !== lastPublishedStatusKey && !publishingStatus) {
            publishingStatus = true;
            void (async () => {
              try {
                const { error: rpcError } = await publishOfficeActorStatus(
                  presence.status,
                  zone,
                  presence.detail,
                );
                if (rpcError) {
                  setOfficeActionError(getOfficeControlErrorMessage(rpcError));
                  nextStatusPublishAt = Date.now() + 5_000;
                } else {
                  lastPublishedStatusKey = statusKey;
                  setOfficeActionError(null);
                }
              } catch (cause) {
                setOfficeActionError(getOfficeControlErrorMessage(cause));
                nextStatusPublishAt = Date.now() + 5_000;
              } finally {
                publishingStatus = false;
              }
            })();
          }
        }
      }
      let doorObstacleIndex = 0;
      meetingDisplayMaterial.emissiveIntensity = THREE.MathUtils.damp(
        meetingDisplayMaterial.emissiveIntensity,
        meetingSessionActive ? 1.65 : 0,
        3.4,
        delta,
      );
      meetingDisplayLight.intensity = THREE.MathUtils.damp(
        meetingDisplayLight.intensity,
        meetingSessionActive ? 1.15 : 0,
        3.4,
        delta,
      );
      for (const fish of aquariumFish) {
        fish.retargetIn -= delta;
        const distance = fish.group.position.distanceTo(fish.target);
        if (fish.retargetIn <= 0 || distance < 0.055) {
          fish.target.set(
            THREE.MathUtils.randFloat(-0.9, 0.9),
            THREE.MathUtils.randFloat(0.84, 1.49),
            THREE.MathUtils.randFloat(-0.36, 0.36),
          );
          fish.retargetIn = THREE.MathUtils.randFloat(0.7, 3.2);
          fish.speed = THREE.MathUtils.randFloat(0.2, 0.42);
        }
        fish.direction.copy(fish.target).sub(fish.group.position);
        const heading = Math.atan2(fish.direction.x, fish.direction.z);
        fish.group.rotation.y = dampAngle(
          fish.group.rotation.y,
          heading,
          2.8,
          delta,
        );
        const swimBlend = 1 - Math.exp(-fish.speed * delta);
        fish.group.position.x = THREE.MathUtils.lerp(
          fish.group.position.x,
          fish.target.x,
          swimBlend,
        );
        fish.group.position.y = THREE.MathUtils.damp(
          fish.group.position.y,
          fish.target.y,
          fish.speed,
          delta,
        ) + Math.sin(elapsed * 1.8 + fish.phase) * 0.012;
        fish.group.position.z = THREE.MathUtils.lerp(
          fish.group.position.z,
          fish.target.z,
          swimBlend,
        );
        fish.tail.rotation.y = Math.sin(elapsed * 10 + fish.phase) * 0.48;
      }
      for (let doorIndex = 0; doorIndex < doors.length; doorIndex += 1) {
        const door = doors[doorIndex];
        const doorMoved =
          Math.abs(
            door.openAmount - collisionDoorOpenAmounts[doorIndex],
          ) > 0.0001;
        collisionDoorOpenAmounts[doorIndex] = door.openAmount;
        for (const panel of door.panels) {
          const obstacle = doorCollisionObstacles[doorObstacleIndex++];
          if (!doorMoved) continue;
          if (door.openAmount > 0.97) {
            obstacle.minX = Number.POSITIVE_INFINITY;
            obstacle.maxX = Number.POSITIVE_INFINITY;
            obstacle.minZ = Number.POSITIVE_INFINITY;
            obstacle.maxZ = Number.POSITIVE_INFINITY;
          } else {
            const worldBounds = doorBoundsScratch.setFromObject(panel.mesh);
            const bounds = toLocalOfficeObstacle(
              {
                minX: worldBounds.min.x,
                maxX: worldBounds.max.x,
                minZ: worldBounds.min.z,
                maxZ: worldBounds.max.z,
              },
              officeScale,
            );
            obstacle.minX = bounds.minX;
            obstacle.maxX = bounds.maxX;
            obstacle.minZ = bounds.minZ;
            obstacle.maxZ = bounds.maxZ;
          }
        }
      }
      for (const actor of actors) {
        if (!simulationAuthority && !localControlSimulation) {
          const seated =
            actor.deliveryTask !== "waiting" &&
            actor.deliveryTask !== "pickup" &&
            (actor.activity === "working" ||
              actor.activity === "chatting" ||
              actor.activity === "eating" ||
              actor.activity === "sleeping");
          actor.body.position.z = THREE.MathUtils.damp(
            actor.body.position.z,
            seated ? 0.08 : 0,
            7,
            delta,
          );
          actor.legs[0].rotation.x = THREE.MathUtils.damp(
            actor.legs[0].rotation.x,
            seated ? -1.2 : 0.15,
            5,
            delta,
          );
          actor.legs[1].rotation.x = THREE.MathUtils.damp(
            actor.legs[1].rotation.x,
            seated ? -1.2 : 0.15,
            5,
            delta,
          );
          actor.lowerLegs[0].rotation.x = THREE.MathUtils.damp(
            actor.lowerLegs[0].rotation.x,
            seated ? 1.2 : 0,
            5,
            delta,
          );
          actor.lowerLegs[1].rotation.x = THREE.MathUtils.damp(
            actor.lowerLegs[1].rotation.x,
            seated ? 1.2 : 0,
            5,
            delta,
          );
          if (actor.activity === "walking") {
            const gaitPhase = elapsed * 8 + actor.offset;
            actor.legs[0].rotation.x = Math.sin(gaitPhase) * 0.48;
            actor.legs[1].rotation.x = Math.sin(gaitPhase + Math.PI) * 0.48;
            actor.lowerLegs[0].rotation.x = Math.max(
              0,
              -Math.sin(gaitPhase),
            ) * 0.62;
            actor.lowerLegs[1].rotation.x = Math.max(
              0,
              -Math.sin(gaitPhase + Math.PI),
            ) * 0.62;
          } else {
            const sleeping = actor.activity === "sleeping";
            actor.body.position.y = THREE.MathUtils.damp(
              actor.body.position.y,
              -0.2,
              5,
              delta,
            );
            actor.upperBody.rotation.x = THREE.MathUtils.damp(
              actor.upperBody.rotation.x,
              sleeping ? 0.32 : 0,
              4,
              delta,
            );
            if (sleeping) {
              actor.arms[0].rotation.x = THREE.MathUtils.damp(
                actor.arms[0].rotation.x,
                -0.72,
                5,
                delta,
              );
              actor.arms[1].rotation.x = THREE.MathUtils.damp(
                actor.arms[1].rotation.x,
                -0.88,
                5,
                delta,
              );
              actor.lowerArms[0].rotation.x = THREE.MathUtils.damp(
                actor.lowerArms[0].rotation.x,
                -1.05,
                6,
                delta,
              );
              actor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
                actor.lowerArms[1].rotation.x,
                -0.88,
                6,
                delta,
              );
              actor.head.rotation.x = THREE.MathUtils.damp(
                actor.head.rotation.x,
                0.42,
                4,
                delta,
              );
            }
            if (actor.deliveryTask === "calling") {
              actor.arms[1].rotation.x = THREE.MathUtils.damp(
                actor.arms[1].rotation.x,
                -0.35,
                6,
                delta,
              );
              actor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
                actor.lowerArms[1].rotation.x,
                -1.35,
                6,
                delta,
              );
            } else if (actor.deliveryTask === "pickup") {
              actor.arms.forEach((arm) => {
                arm.rotation.x = THREE.MathUtils.damp(
                  arm.rotation.x,
                  -0.68,
                  6,
                  delta,
                );
              });
            }
          }
          continue;
        }
        if (actor.meetingReturnPending) continue;
        if (actor.activity === "walking") {
          actor.sleepIndicator.visible = false;
          const target = actor.path[actor.pathIndex];
          if (target) {
            const dx = target.x - actor.group.position.x;
            const dz = target.z - actor.group.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 0.08) {
              actor.group.position.x = target.x;
              actor.group.position.z = target.z;
              actor.pathIndex += 1;
              actor.blockedTime = 0;
              actor.hasTriedEscape = false;
              if (actor.pathIndex >= actor.path.length) {
                if (
                  actor.deliveryTask === "outbound" &&
                  deliveryShipper.recipient === actor
                ) {
                  actor.goalSpotId = null;
                  actor.goalObstacleId = undefined;
                  actor.currentObstacleId = undefined;
                  actor.currentSeatPosition = undefined;
                  actor.path = [];
                  actor.pathIndex = 0;
                  actor.deliveryTask = "waiting";
                  actor.activity = "chatting";
                  actor.activityTime = Number.POSITIVE_INFINITY;
                  const toShipper = deliveryShipper.group.position
                    .clone()
                    .sub(actor.group.position);
                  actor.targetRotation = Math.atan2(toShipper.x, toShipper.z);
                  actor.actionTime = 0;
                  continue;
                }
                const spot = activitySpots.find((item) => item.id === actor.goalSpotId);
                if (spot) {
                  actor.activity = spot.activity;
                  actor.isWatchingAquarium = Boolean(spot.aquariumViewing);
                  actor.currentObstacleId = spot.obstacleId;
                  actor.currentSeatPosition = spot.position.clone();
                  actor.targetRotation = spot.rotation;
                  actor.activityTime = actor.isMeetingParticipant
                    ? meetingDuration
                    : spot.aquariumViewing
                      ? actor.activityTime
                    : actor.username?.trim().toLowerCase() === "dung0001" &&
                        spot.zoneId === "administration" &&
                        spot.activity === "working"
                      ? Number.POSITIVE_INFINITY
                      : durationFor(spot.activity);
                  if (actor.deliveryTask === "communication_wait") {
                    actor.activityTime = 2;
                  }
                  if (actor.deliveryTask === "returning") {
                    actor.carriedPackage.visible = false;
                    actor.deliveryTask = "none";
                    actor.deliveryReturnSpotId = undefined;
                    actor.currentAction = null;
                  }
                } else {
                  assignNextActivity(actor);
                }
              }
            } else {
              const step = Math.min(distance, actor.speed * delta);
              const direction = Math.atan2(dx, dz);
              const moveTarget = {
                x: actor.group.position.x + (dx / distance) * step,
                z: actor.group.position.z + (dz / distance) * step,
              };
              const currentObstacle = obstacleBounds.find(
                (obstacle) => obstacle.id === actor.currentObstacleId,
              );
              if (
                currentObstacle &&
                isOutsideObstacle(
                  actor.group.position,
                  currentObstacle,
                  actorCollisionRadius,
                )
              ) {
                actor.currentObstacleId = undefined;
                actor.currentSeatPosition = undefined;
              }
              const obstacles = movementObstaclesForActor(actor);
              const next = moveWithCollisions(
                actor.group.position,
                moveTarget,
                obstacles,
                actorCollisionRadius,
              );
              const madeProgress = hasMovementProgress(
                actor.group.position,
                next,
                target,
                step * 0.25,
              );
              actor.group.position.x = next.x;
              actor.group.position.z = next.z;
              const occupiedObstacle = obstacleBounds.find(
                (obstacle) => obstacle.id === actor.currentObstacleId,
              );
              if (
                occupiedObstacle &&
                isOutsideObstacle(
                  actor.group.position,
                  occupiedObstacle,
                  actorCollisionRadius,
                )
              ) {
                if (
                  actor.seatExitIgnoreObstacleId === occupiedObstacle.id
                ) {
                  actor.seatExitRestoreAt ??= Date.now() + 2_000;
                }
                actor.currentObstacleId = undefined;
                actor.currentSeatPosition = undefined;
              }
              actor.blockedTime =
                !madeProgress ? actor.blockedTime + delta : 0;
              if (madeProgress) actor.hasTriedEscape = false;
              if (
                actor.blockedTime >= 0.7 &&
                !actor.hasTriedEscape
              ) {
                actor.hasTriedEscape = true;
                const destination = actor.path[actor.path.length - 1];
                if (destination) {
                  const detour = findUnblockingPath(
                    actor.group.position,
                    destination,
                    obstacles,
                    {
                      bounds: officeBounds,
                      radius: actorCollisionRadius,
                    },
                  );
                  if (detour && detour.length > 1) {
                    actor.path = detour.map(
                      ({ x, z }) => new THREE.Vector3(x, 0, z),
                    );
                    actor.pathIndex = 1;
                    actor.blockedTime = 0;
                  }
                }
              }
              if (actor.blockedTime > 1.4) {
                if (actor.deliveryTask === "outbound") {
                  const isInsideOffice =
                    actor.group.position.x >= officeBounds.minX &&
                    actor.group.position.x <= officeBounds.maxX &&
                    actor.group.position.z >= officeBounds.minZ &&
                    actor.group.position.z <= officeBounds.maxZ;
                  if (isInsideOffice) {
                    const path = createDeliveryExitPath(
                      actor,
                      deliveryReceivePosition(),
                    );
                    if (path) {
                      actor.path = path;
                      actor.pathIndex = actor.path.length > 1 ? 1 : 0;
                    }
                  }
                } else {
                  const spot = activitySpots.find(
                    (item) => item.id === actor.goalSpotId,
                  );
                  if (spot) {
                    const path = findPathForActor(
                      actor,
                      spot.position,
                      [spot.obstacleId].filter(
                        (id): id is string => Boolean(id),
                      ),
                    );
                    if (path) {
                      actor.path = path.map(
                        ({ x, z }) => new THREE.Vector3(x, 0, z),
                      );
                      actor.pathIndex = actor.path.length > 1 ? 1 : 0;
                    } else {
                      assignNextActivity(actor);
                    }
                  } else {
                    assignNextActivity(actor);
                  }
                }
                actor.blockedTime = 0;
                actor.hasTriedEscape = false;
              }
              actor.group.rotation.y = dampAngle(
                actor.group.rotation.y,
                direction,
                8,
                delta,
              );
            }
          } else {
            if (actor.activity === "walking") {
              assignNextActivity(actor);
              continue;
            } else if (
              actor.isMeetingParticipant &&
              isOfficeMeetingActive(
                localMeetingRef.current ?? officeMeetingRef.current,
              )
            ) {
              actor.activityTime = Number.POSITIVE_INFINITY;
            } else if (actor.manualControlAction) {
              actor.activityTime = Number.POSITIVE_INFINITY;
            } else if (actor.activityTime > 0) {
              actor.activityTime -= delta;
            } else {
              assignNextActivity(actor);
            }
          }
          const gaitPhase =
            elapsed * (7.5 + actor.speed * 2.2) + actor.offset;
          const gait = Math.sin(gaitPhase);
          const oppositeGait = Math.sin(gaitPhase + Math.PI);
          actor.group.position.y = 0.035 + Math.abs(Math.sin(gaitPhase * 2)) * 0.024;
          actor.body.position.y = THREE.MathUtils.damp(
            actor.body.position.y,
            0,
            10,
            delta,
          );
          actor.upperBody.rotation.z = THREE.MathUtils.damp(
            actor.upperBody.rotation.z,
            Math.sin(gaitPhase) * 0.025,
            7,
            delta,
          );
          actor.upperBody.rotation.x = THREE.MathUtils.damp(
            actor.upperBody.rotation.x,
            -0.055,
            7,
            delta,
          );
          actor.head.rotation.x = THREE.MathUtils.damp(
            actor.head.rotation.x,
            Math.sin(gaitPhase * 0.5) * 0.025,
            5,
            delta,
          );
          actor.legs[0].rotation.x = gait * 0.48;
          actor.legs[1].rotation.x = oppositeGait * 0.48;
          actor.lowerLegs[0].rotation.x = Math.max(0, -gait) * 0.62;
          actor.lowerLegs[1].rotation.x = Math.max(0, -oppositeGait) * 0.62;
        } else {
          if (actor.deliveryTask === "pickup") {
            actor.activityTime -= delta;
            if (actor.activityTime <= 0) {
              if (!deliveryShipper.packageHandedOff) {
                actor.activityTime = 0.1;
                continue;
              }
              actor.carriedPackage.visible = true;
              actor.deliveryTask = "returning";
              deliveryShipper.package.visible = false;
              if (deliveryShipper.phase === "pickup") {
                deliveryShipper.phase = "mounting";
                deliveryShipper.waitTime = 0;
              }
              const actorName = actor.username?.trim().toLowerCase();
              const savedReturnSpot = activitySpots.find(
                (spot) => spot.id === actor.deliveryReturnSpotId,
              );
              const returnSpots = [
                ...(savedReturnSpot ? [savedReturnSpot] : []),
                ...activitySpots.filter(
                  (spot) =>
                    spot.activity === "working" &&
                    (!spot.requiredUsername ||
                      spot.requiredUsername.toLowerCase() === actorName),
                ),
              ];
              const returnSpot = returnSpots.find(
                (spot) =>
                  isSpotAvailableForActor(spot, actor) &&
                  findPathForActor(
                    actor,
                    spot.position,
                    [spot.obstacleId].filter(
                      (id): id is string => Boolean(id),
                    ),
                  ) !== null,
              );
              if (returnSpot && sendToSpot(actor, returnSpot)) {
                actor.currentAction = null;
                continue;
              }
              actor.carriedPackage.visible = false;
              actor.deliveryTask = "none";
              actor.deliveryReturnSpotId = undefined;
              deliveryShipper.recipient = null;
              assignNextActivity(actor);
              continue;
            }
          } else if (actor.deliveryTask === "calling") {
            actor.activityTime -= delta;
            if (actor.activityTime <= 0) {
              startDeliveryCommunication(actor);
            }
          } else if (actor.deliveryTask === "communication_wait") {
            actor.activityTime -= delta;
            if (actor.activityTime <= 0) {
              actor.activityTime = Number.POSITIVE_INFINITY;
              if (
                deliveryShipper.recipient === actor &&
                deliveryShipper.phase === "communication_wait"
              ) {
                deliveryShipper.phase = "approaching";
                deliveryShipper.progress = 0;
                deliveryShipper.package.visible = true;
                deliveryShipper.phone.visible = false;
                deliveryShipper.kickstand.visible = false;
                deliveryShipper.group.visible = true;
                deliveryShipper.opacityMaterials.forEach((material) => {
                  material.opacity = 0;
                });
              }
            }
          } else if (
            !actor.manualControlAction &&
            actor.deliveryTask !== "waiting"
          ) {
            actor.activityTime -= delta;
          }
          if (
            actor.deliveryTask !== "pickup" &&
            actor.deliveryTask !== "waiting" &&
            actor.deliveryTask !== "calling" &&
            actor.deliveryTask !== "communication_wait" &&
            !actor.manualControlAction &&
            actor.activityTime <= 0
          ) {
            assignNextActivity(actor);
            continue;
          }
          const angleDifference = Math.atan2(
            Math.sin(actor.targetRotation - actor.group.rotation.y),
            Math.cos(actor.targetRotation - actor.group.rotation.y),
          );
          if (Math.abs(angleDifference) < 0.015) {
            actor.group.rotation.y = actor.targetRotation;
          } else {
            actor.group.rotation.y = dampAngle(
              actor.group.rotation.y,
              actor.targetRotation,
              5,
              delta,
            );
          }
          const sleeping = actor.activity === "sleeping";
          actor.sleepIndicator.visible = sleeping;
          if (sleeping) {
            const sleepCycle =
              ((elapsed + actor.offset) % 2.5) / 2.5;
            actor.sleepIndicator.position.set(
              0.35 + sleepCycle * 0.3,
              1.55 + sleepCycle * 0.5,
              0.12,
            );
            actor.sleepIndicator.scale.set(
              0.58 + sleepCycle * 0.45,
              0.27 + sleepCycle * 0.2,
              1,
            );
            (
              actor.sleepIndicator.material as THREE.SpriteMaterial
            ).opacity = 1 - THREE.MathUtils.smoothstep(sleepCycle, 0.35, 1);
          }
          actor.phone.visible = actor.deliveryTask === "calling";
          actor.group.position.y = 0.035;
          actor.upperBody.rotation.x = THREE.MathUtils.damp(
            actor.upperBody.rotation.x,
            sleeping ? 0.32 : 0,
            4,
            delta,
          );
          actor.upperBody.rotation.z = THREE.MathUtils.damp(
            actor.upperBody.rotation.z,
            0,
            5,
            delta,
          );
          updateActorAnimation(actor, elapsed, delta);
        }
      }
      for (const actor of actors) {
        const carryingMeetingLaptop =
          actor.isMeetingParticipant || actor.meetingLaptopReturning;
        if (!carryingMeetingLaptop) {
          actor.meetingLaptop.visible = false;
          continue;
        }
        const desktopPosition = actor.meetingLaptopTargetPosition;
        const atMeetingSeat =
          actor.isMeetingParticipant &&
          actor.activity !== "walking" &&
          desktopPosition !== undefined;
        const typingMotion =
          actor.meetingLaptopOpen > 0.72
            ? Math.sin(elapsed * 8 + actor.offset) * 0.025
            : 0;
        actor.arms[0].rotation.x = THREE.MathUtils.damp(
          actor.arms[0].rotation.x,
          atMeetingSeat ? -0.36 : -0.62,
          7,
          delta,
        );
        actor.arms[1].rotation.x = THREE.MathUtils.damp(
          actor.arms[1].rotation.x,
          atMeetingSeat ? -0.36 : -0.62,
          7,
          delta,
        );
        actor.arms[0].rotation.z = THREE.MathUtils.damp(
          actor.arms[0].rotation.z,
          -0.08,
          7,
          delta,
        );
        actor.arms[1].rotation.z = THREE.MathUtils.damp(
          actor.arms[1].rotation.z,
          0.08,
          7,
          delta,
        );
        actor.lowerArms[0].rotation.x = THREE.MathUtils.damp(
          actor.lowerArms[0].rotation.x,
          atMeetingSeat ? -0.94 + typingMotion : -0.72,
          7,
          delta,
        );
        actor.lowerArms[1].rotation.x = THREE.MathUtils.damp(
          actor.lowerArms[1].rotation.x,
          atMeetingSeat ? -0.94 - typingMotion : -0.72,
          7,
          delta,
        );
        actor.meetingLaptop.visible = true;
        const angleToDesktop = Math.atan2(
          Math.sin(
            (actor.meetingLaptopTargetRotation ?? 0) -
              actor.meetingLaptop.rotation.y,
          ),
          Math.cos(
            (actor.meetingLaptopTargetRotation ?? 0) -
              actor.meetingLaptop.rotation.y,
          ),
        );
        const closingOnTable =
          actor.meetingLaptopOnTable &&
          !atMeetingSeat &&
          actor.meetingLaptopOpen >= 0.025;
        const laptopAtTable = atMeetingSeat || closingOnTable;
        const laptopReadyToOpen =
          atMeetingSeat &&
          actor.meetingLaptopOnTable &&
          desktopPosition !== undefined &&
          actor.meetingLaptop.position.distanceTo(desktopPosition) <= 0.075 &&
          Math.abs(angleToDesktop) <= 0.08 &&
          Math.abs(actor.meetingLaptop.scale.x - 1) <= 0.03;
        if (atMeetingSeat && !actor.meetingLaptopOnTable) {
          scene.attach(actor.meetingLaptop);
          actor.meetingLaptopOnTable = true;
        }
        if (actor.meetingLaptopOnTable) {
          const targetPosition =
            laptopAtTable && desktopPosition
              ? desktopPosition
              : actor.group.localToWorld(
                  laptopCarryWorldPosition.set(0, 0.94, 0.34),
                );
          actor.meetingLaptop.position.x = THREE.MathUtils.damp(
            actor.meetingLaptop.position.x,
            targetPosition.x,
            6,
            delta,
          );
          actor.meetingLaptop.position.y = THREE.MathUtils.damp(
            actor.meetingLaptop.position.y,
            targetPosition.y,
            6,
            delta,
          );
          actor.meetingLaptop.position.z = THREE.MathUtils.damp(
            actor.meetingLaptop.position.z,
            targetPosition.z,
            6,
            delta,
          );
          actor.meetingLaptop.rotation.y = dampAngle(
            actor.meetingLaptop.rotation.y,
            laptopAtTable
              ? actor.meetingLaptopTargetRotation ?? 0
              : actor.group.rotation.y,
            7,
            delta,
          );
          if (
            !atMeetingSeat &&
            actor.meetingLaptopOpen < 0.025 &&
            actor.meetingLaptop.position.distanceTo(targetPosition) < 0.07
          ) {
            actor.group.attach(actor.meetingLaptop);
            actor.meetingLaptopOnTable = false;
          }
        } else {
          actor.meetingLaptop.position.x = THREE.MathUtils.damp(
            actor.meetingLaptop.position.x,
            0,
            6,
            delta,
          );
          actor.meetingLaptop.position.y = THREE.MathUtils.damp(
            actor.meetingLaptop.position.y,
            0.94,
            6,
            delta,
          );
          actor.meetingLaptop.position.z = THREE.MathUtils.damp(
            actor.meetingLaptop.position.z,
            0.34,
            6,
            delta,
          );
          actor.meetingLaptop.rotation.y = dampAngle(
            actor.meetingLaptop.rotation.y,
            0,
            7,
            delta,
          );
        }
        actor.meetingLaptop.scale.setScalar(
          THREE.MathUtils.damp(
            actor.meetingLaptop.scale.x,
            laptopAtTable ? 1 : 0.72,
            6,
            delta,
          ),
        );
        actor.meetingLaptopOpen = THREE.MathUtils.damp(
          actor.meetingLaptopOpen,
          laptopReadyToOpen ? 1 : 0,
          laptopReadyToOpen ? 3.2 : 4.2,
          delta,
        );
        actor.meetingLaptopLid.rotation.x =
          -actor.meetingLaptopOpen * (Math.PI / 2 - 0.12);
        actor.meetingLaptopScreen.emissiveIntensity =
          THREE.MathUtils.smoothstep(
            actor.meetingLaptopOpen,
            0.72,
            0.98,
          ) * 1.15;
        if (
          actor.meetingLaptopReturning &&
          !actor.meetingLaptopOnTable &&
          !actor.meetingReturnPending &&
          actor.activity !== "walking" &&
          actor.meetingLaptopOpen < 0.025 &&
          actor.meetingLaptop.parent === actor.group &&
          Math.abs(actor.meetingLaptop.position.x) < 0.035 &&
          Math.abs(actor.meetingLaptop.position.y - 0.94) < 0.035 &&
          Math.abs(actor.meetingLaptop.position.z - 0.34) < 0.035
        ) {
          actor.meetingLaptop.visible = false;
          actor.meetingLaptopReturning = false;
          actor.meetingLaptopTargetPosition = undefined;
          actor.meetingLaptopTargetRotation = undefined;
        }
        if (
          actor.meetingReturnPending &&
          !actor.meetingLaptopOnTable &&
          actor.meetingLaptopOpen < 0.025 &&
          actor.meetingLaptop.parent === actor.group
        ) {
          resumeActorAfterMeeting(actor);
        }
      }
      if (
        simulationAuthority &&
        !localControlSimulation &&
        liveChannelSubscribed &&
        liveConnection?.isJoined() &&
        liveConnection.isConnected() &&
        !publishingSnapshot &&
        currentTime - lastLiveBroadcastAt >= 120
      ) {
        lastLiveBroadcastAt = currentTime;
        publishingSnapshot = true;
        void (async () => {
          try {
            const result =
              await liveConnection.sendSnapshot(captureLiveSnapshot());
            if (result !== "ok") {
              setOfficeRealtimeError(
                "Live office position updates are delayed. Check the Supabase Realtime connection.",
              );
            }
          } catch (cause: unknown) {
            setOfficeRealtimeError(getOfficeControlErrorMessage(cause));
          } finally {
            publishingSnapshot = false;
          }
        })();
      }
      for (const door of doors) {
        const shouldOpen = door.manual
          ? Boolean(door.manualTargetOpen)
          : actors.some(
              (actor) =>
                actor.activity === "walking" &&
                Math.hypot(
                  actor.group.position.x - door.x,
                  actor.group.position.z - door.z,
                ) < 2.1,
            ) ||
            (cleaningActor.group.visible &&
              cleaningActor.activity === "walking" &&
              Math.hypot(
                cleaningActor.group.position.x - door.x,
                cleaningActor.group.position.z - door.z,
              ) < 2.1);
        const target = shouldOpen ? 1 : 0;
        const previousOpenAmount = door.openAmount;
        door.openAmount = THREE.MathUtils.damp(
          door.openAmount,
          target,
          5.5,
          delta,
        );
        if (Math.abs(door.openAmount - previousOpenAmount) > 0.0001) {
          for (const panel of door.panels) {
            if (panel.swing) {
              panel.mesh.position.copy(panel.closed);
              panel.mesh.rotation.y = THREE.MathUtils.lerp(
                panel.swing.closedY,
                panel.swing.openY,
                door.openAmount,
              );
            } else {
              panel.mesh.position.lerpVectors(
                panel.closed,
                panel.open,
                door.openAmount,
              );
            }
            panel.mesh.updateMatrixWorld(true);
          }
        }
        if (door.indicator) {
          const material = door.indicator.material as THREE.MeshStandardMaterial;
          material.color.set(shouldOpen ? "#8bc59a" : "#c9a56d");
          material.emissive.set(shouldOpen ? "#316744" : "#72511f");
        }
      }
      if (cameraAnchorModeRef.current !== "free") {
        const pinnedActor =
          cameraAnchorModeRef.current === "actor"
            ? actors.find(
                (actor) =>
                  actor.username === selectedCameraActorRef.current,
              )
            : undefined;
        if (pinnedActor) {
          pinnedActor.group.getWorldPosition(cameraTargetPosition);
          cameraTargetPosition.y += 0.98;
        } else {
          cameraTargetPosition.copy(initialOrbitTarget);
        }
        const followBlend = 1 - Math.exp(-8 * delta);
        const shift = cameraShift
          .copy(cameraTargetPosition)
          .sub(orbitTarget)
          .multiplyScalar(followBlend);
        if (shift.lengthSq() > 0.000001) {
          orbitTarget.add(shift);
          camera.position.add(shift);
          camera.lookAt(orbitTarget);
        }
      }
      const previousTheta = spherical.theta;
      const previousPhi = spherical.phi;
      const previousZoom = camera.zoom;
      spherical.theta = dampAngle(spherical.theta, targetTheta, 8, delta);
      spherical.phi = THREE.MathUtils.damp(
        spherical.phi,
        targetPhi,
        8,
        delta,
      );
      camera.zoom = THREE.MathUtils.damp(camera.zoom, targetZoom, 8, delta);
      if (
        Math.abs(spherical.theta - previousTheta) > 0.00001 ||
        Math.abs(spherical.phi - previousPhi) > 0.00001 ||
        Math.abs(camera.zoom - previousZoom) > 0.00001
      ) {
        camera.position
          .copy(orbitTarget)
          .add(cameraOffsetScratch.setFromSpherical(spherical));
        camera.lookAt(orbitTarget);
        camera.updateProjectionMatrix();
        if (compassArrow) {
          compassArrow.style.transform = `rotate(${-spherical.theta}rad)`;
        }
      }
      cameraSide.copy(camera.position).sub(orbitTarget).normalize();
      for (const wall of exteriorWalls) {
        const faceOn = Math.max(0, cameraSide.dot(wall.normal));
        const targetOpacity = 1 - faceOn * 0.72;
        wall.material.opacity = THREE.MathUtils.damp(
          wall.material.opacity,
          targetOpacity,
          4.5,
          delta,
        );
      }
      renderer.render(scene, camera);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (frameId === 0) {
        lastFrameTime = performance.now();
        frameId = window.requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    resize();
    if (!document.hidden) {
      frameId = window.requestAnimationFrame(animate);
    }

    let activePointer:
      | {
          id: number;
          x: number;
          y: number;
          theta: number;
          phi: number;
          startTarget: THREE.Vector3;
          startCameraPosition: THREE.Vector3;
          dragged: boolean;
        }
      | undefined;
    const applyOrbit = () => {
      camera.position
        .copy(orbitTarget)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      camera.lookAt(orbitTarget);
      const compassArrow = host.querySelector<HTMLElement>(
        ".office-scene__compass i",
      );
      if (compassArrow) {
        compassArrow.style.transform = `rotate(${-spherical.theta}rad)`;
      }
    };
    const resetCamera = () => {
      targetTheta = initialCameraSpherical.theta;
      targetPhi = initialCameraSpherical.phi;
      targetZoom = initialCameraZoom;
      cameraAnchorModeRef.current = "center";
      selectedCameraActorRef.current = "";
      setCameraAnchorMode("center");
      setSelectedCameraActor("");
    };
    viewControlRef.current = (action) => {
      if (action === "zoom-in") targetZoom = Math.min(targetZoom * 1.2, 3.2);
      if (action === "zoom-out") targetZoom = Math.max(targetZoom / 1.2, 0.58);
      if (action === "rotate-left") targetTheta += Math.PI / 12;
      if (action === "rotate-right") targetTheta -= Math.PI / 12;
      if (action === "reset") resetCamera();
    };

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (event.button !== 0) return;
      activePointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        theta: spherical.theta,
        phi: spherical.phi,
        startTarget: orbitTarget.clone(),
        startCameraPosition: camera.position.clone(),
        dragged: false,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      if (activePointer?.id === event.pointerId && event.buttons === 1) {
        const deltaX = event.clientX - activePointer.x;
        const deltaY = event.clientY - activePointer.y;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 4) activePointer.dragged = true;
        if (activePointer.dragged) {
          if (cameraAnchorModeRef.current === "free") {
            camera.updateMatrixWorld();
            const right = new THREE.Vector3().setFromMatrixColumn(
              camera.matrixWorld,
              0,
            );
            const up = new THREE.Vector3().setFromMatrixColumn(
              camera.matrixWorld,
              1,
            );
            const unitsPerPixel =
              (camera.top - camera.bottom) /
              (camera.zoom * Math.max(1, bounds.height));
            const pan = right
              .multiplyScalar(-deltaX * unitsPerPixel)
              .add(up.multiplyScalar(deltaY * unitsPerPixel));
            orbitTarget.copy(activePointer.startTarget).add(pan);
            orbitTarget.x = THREE.MathUtils.clamp(
              orbitTarget.x,
              -roadFogBoundary * officeScale,
              roadFogBoundary * officeScale,
            );
            orbitTarget.z = THREE.MathUtils.clamp(
              orbitTarget.z,
              (rearRoadCenterZ - 12) * officeScale,
              (roadCenterZ + 12) * officeScale,
            );
            pan.copy(orbitTarget).sub(activePointer.startTarget);
            camera.position
              .copy(activePointer.startCameraPosition)
              .add(pan);
            camera.lookAt(orbitTarget);
          } else {
            spherical.theta = activePointer.theta - deltaX * 0.006;
            spherical.phi = THREE.MathUtils.clamp(
              activePointer.phi + deltaY * 0.006,
              0.24,
              cameraMaxTilt,
            );
            targetTheta = spherical.theta;
            targetPhi = spherical.phi;
            applyOrbit();
          }
        }
        renderer.domElement.style.cursor = activePointer.dragged ? "grabbing" : "grab";
        return;
      }
      raycaster.setFromCamera(pointer, camera);
      const manualDoorObjects = manualDoorsRef.current.flatMap((door) =>
        door.panels.flatMap((panel) =>
          panel.interactionObject ? [panel.interactionObject] : [],
        ),
      );
      const actorObjects = actorGroupsRef.current.map(({ group }) => group);
      renderer.domElement.style.cursor =
        raycaster.intersectObjects(manualDoorObjects, false).length ||
        raycaster.intersectObjects(actorObjects, true).length ||
        raycaster.intersectObjects(zonesRef.current, false).length
        ? "pointer"
        : "grab";
    }
    function handlePointerUp(event: globalThis.PointerEvent) {
      if (activePointer?.id !== event.pointerId) return;
      if (activePointer.dragged) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 250);
      }
      activePointer = undefined;
      renderer.domElement.style.cursor = "grab";
    }
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      targetZoom = THREE.MathUtils.clamp(
        targetZoom * Math.exp(-event.deltaY * 0.001),
        0.58,
        3.2,
      );
    }
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (liveConnection) void liveConnection.unsubscribe();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          if (object instanceof THREE.Mesh) object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if ("map" in material && material.map instanceof THREE.Texture) {
              material.map.dispose();
            }
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      zonesRef.current = [];
      actorGroupsRef.current = [];
      manualDoorsRef.current = [];
      roomLabelsRef.current = [];
      actorLabelsRef.current = [];
      cameraRef.current = null;
      raycasterRef.current = null;
      viewControlRef.current = () => {};
    };
  }, [currentUserId, members, isLocalControlOnlyUser]);

  useEffect(() => {
    languageRef.current = language;
    for (const label of roomLabelsRef.current) {
      const name = label.userData.sourceName;
      if (typeof name === "string") {
        updateRoomLabel(label, translateText(name, language));
      }
    }
    const canvas = hostRef.current?.querySelector("canvas");
    if (canvas) {
      canvas.setAttribute(
        "aria-label",
        language === "vi"
          ? "Mặt bằng văn phòng 3D tương tác"
          : "Interactive 3D office floor plan",
      );
    }
  }, [language]);

  function handleCanvasClick(event: PointerEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const canvas = event.currentTarget.querySelector("canvas");
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    if (!canvas || event.target !== canvas || !camera || !raycaster) return;

    const bounds = canvas.getBoundingClientRect();
    pointerRef.current.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerRef.current, camera);
    const manualDoorObjects = manualDoorsRef.current.flatMap((door) =>
      door.panels.flatMap((panel) =>
        panel.interactionObject ? [panel.interactionObject] : [],
      ),
    );
    const [doorHit] = raycaster.intersectObjects(manualDoorObjects, false);
    if (doorHit) {
      const door = manualDoorsRef.current.find((candidate) =>
        candidate.panels.some(
          (panel) => panel.interactionObject === doorHit.object,
        ),
      );
      if (door) {
        door.manualTargetOpen = !door.manualTargetOpen;
        return;
      }
    }
    const actorObjects = actorGroupsRef.current.map(({ group }) => group);
    const actorHits = raycaster.intersectObjects(actorObjects, true);
    const actorHit = actorHits.find((intersection) =>
      actorGroupsRef.current.some(({ group }) => {
        let object: THREE.Object3D | null = intersection.object;
        while (object) {
          if (object === group) return true;
          object = object.parent;
        }
        return false;
      }),
    );
    if (actorHit) {
      const actor = actorGroupsRef.current.find(({ group }) => {
        let object: THREE.Object3D | null = actorHit.object;
        while (object) {
          if (object === group) return true;
          object = object.parent;
        }
        return false;
      });
      if (actor) {
        selectedCameraActorRef.current = actor.username;
        cameraAnchorModeRef.current = "actor";
        setSelectedCameraActor(actor.username);
        setCameraAnchorMode("actor");
        return;
      }
    }
    const [hit] = raycaster.intersectObjects(zonesRef.current, false);
    const destination = hit?.object.userData.destination as
      | OfficeDestination
      | undefined;
    if (destination) onSelect(destination);
  }

  const visibleMembers = members.slice(0, 16);
  const isOnline = (id: string) => presence.onlineMembers.some((person) => person.user_id === id);
  const onlineCount = members.filter((member) => isOnline(member.id)).length;
  const presenceLabel = (id: string) => !presence.available
    ? t("Status unavailable")
    : isOnline(id) ? t("Online") : t("Offline");
  return (
    <div className="office-experience">
      <div className="office-experience__toolbar">
        <div>
          <span className="eyebrow">DRIKAPEX · DIGITAL HEADQUARTERS</span>
          <h2>One place. Every team.</h2>
          <p>
            Explore your workspace. Select a room to open its live management
            module.
          </p>
        </div>
        <div className="office-live">
          <span className="office-live__pulse" aria-hidden="true" />
          <span>
            {presence.available ? <><strong>{onlineCount}</strong> {t("online")}</> : t("Status unavailable")}
          </span>
        </div>
      </div>

      <div className="office-experience__content">
        <div className="office-scene-card" ref={sceneCardRef}>
          <div
            aria-label={t("Interactive roofless 3D office map")}
            className="office-scene"
            onClick={handleCanvasClick}
            ref={hostRef}
          >
            <div className="office-scene__topline">
              <span className="office-scene__brand">
                <span className="office-scene__brand-mark">D</span>
                DRIKAPEX <span>· HQ FLOOR 01</span>
              </span>
              <span className="office-scene__live-label">
                <span className="office-live__pulse" aria-hidden="true" />
                LIVE WORKSPACE
              </span>
            </div>
            <div className="office-scene__controls" role="group" aria-label={t("3D view controls")}>
              <button
                aria-label={t("Zoom out")}
                onClick={() => viewControlRef.current("zoom-out")}
                title={t("Zoom out")}
                type="button"
              >
                −
              </button>
              <button
                aria-label={t("Zoom in")}
                onClick={() => viewControlRef.current("zoom-in")}
                title={t("Zoom in")}
                type="button"
              >
                +
              </button>
              <span className="office-scene__control-divider" aria-hidden="true" />
              <button
                aria-label={t("Rotate view left")}
                onClick={() => viewControlRef.current("rotate-left")}
                title={t("Rotate view left")}
                type="button"
              >
                ↶
              </button>
              <button
                aria-label={t("Rotate view right")}
                onClick={() => viewControlRef.current("rotate-right")}
                title={t("Rotate view right")}
                type="button"
              >
                ↷
              </button>
              <button
                aria-label={t("Reset 3D view")}
                onClick={() => viewControlRef.current("reset")}
                title={t("Reset 3D view")}
                type="button"
              >
                ⌂
              </button>
              <button
                aria-label={t(
                  sceneLabelsVisible
                    ? "Hide actor and location labels"
                    : "Show actor and location labels",
                )}
                aria-pressed={!sceneLabelsVisible}
                onClick={() => setSceneLabelsVisible((visible) => !visible)}
                title={t(
                  sceneLabelsVisible
                    ? "Hide actor and location labels"
                    : "Show actor and location labels",
                )}
                type="button"
              >
                {sceneLabelsVisible ? "◉" : "◎"}
              </button>
            </div>
            <div
              className="office-scene__camera-pin"
              role="group"
              aria-label={t("Camera focus controls")}
            >
              <select
                aria-label={t("Choose actor to follow")}
                onChange={(event) => {
                  const username = event.currentTarget.value;
                  selectedCameraActorRef.current = username;
                  setSelectedCameraActor(username);
                }}
                value={selectedCameraActor}
              >
                <option value="">{t("Select actor")}</option>
                {cameraActorOptions.map((member) => (
                  <option
                    key={member.id}
                    value={member.username.trim().toLowerCase()}
                  >
                    {member.name}
                  </option>
                ))}
              </select>
              <button
                aria-pressed={cameraAnchorMode === "actor"}
                disabled={!selectedCameraActor}
                onClick={() => {
                  if (!selectedCameraActor) return;
                  cameraAnchorModeRef.current = "actor";
                  selectedCameraActorRef.current = selectedCameraActor;
                  setCameraAnchorMode("actor");
                }}
                title={t("Pin camera to selected actor")}
                type="button"
              >
                {t("Follow actor")}
              </button>
              <button
                aria-pressed={cameraAnchorMode === "center"}
                onClick={() => {
                  cameraAnchorModeRef.current = "center";
                  setCameraAnchorMode("center");
                }}
                title={t("Pin camera to rug center")}
                type="button"
              >
                {t("Center")}
              </button>
              <button
                aria-pressed={cameraAnchorMode === "free"}
                onClick={() => {
                  cameraAnchorModeRef.current = "free";
                  setCameraAnchorMode("free");
                }}
                title={t("Move camera freely")}
                type="button"
              >
                {t("Free")}
              </button>
            </div>
            <div
              className={`office-scene__quick-controls${quickControlsOpen ? " office-scene__quick-controls--open" : ""}`}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setQuickControlsOpen(false);
                }
              }}
              onFocus={() => setQuickControlsOpen(true)}
              onMouseEnter={() => setQuickControlsOpen(true)}
              onMouseLeave={() => setQuickControlsOpen(false)}
            >
              {controlActions.length > 0 && (
                <>
                  <button
                    aria-label={t("Personal controls")}
                    aria-expanded={quickControlsOpen}
                    className="office-scene__quick-trigger"
                    onClick={openPersonalControls}
                    type="button"
                  >
                    <span aria-hidden="true">⌘</span>
                    <span className="office-scene__quick-label">
                      {t("Personal controls")}
                    </span>
                  </button>
                  <div
                    aria-label={t("Personal controls")}
                    className="office-scene__quick-panel"
                    role="group"
                  >
                    <div className="office-scene__quick-heading">
                      <strong>{t("Your office mode")}</strong>
                      <span className="office-scene__local-badge">
                        <i aria-hidden="true" />
                        {t("LOCAL ONLY")}
                      </span>
                    </div>
                    <p className="office-scene__local-note">
                      {t(
                        "This panel controls the office on this device only. No database connection is required.",
                      )}
                    </p>
                    {sharedMeetingActive && (
                      <p className="office-scene__local-note" role="status">
                        {t(
                          "The meeting will continue. Personal movement is paused until it ends.",
                        )}
                      </p>
                    )}
                    <p className="office-control__mode">
                      {currentActorState?.mode === "manual"
                        ? `${t("Manual control")} · ${t("returns to automatic in")} ${currentActorState.expires_at ? getRemainingTime(currentActorState.expires_at) : "5:00"}`
                        : t("Automatic mode")}
                    </p>
                    <div className="office-control__actions">
                      <button
                        className="office-control__action office-control__action--auto"
                        disabled={
                          sharedMeetingActive ||
                          currentActorState?.mode !== "manual"
                        }
                        onClick={() => void setOfficeCommand("auto")}
                        type="button"
                      >
                        {t(controlLabels.auto)}
                      </button>
                    </div>
                    <p className="office-scene__quick-actions-label">
                      {t("PERSONAL MOVEMENT")}
                    </p>
                    <div className="office-control__actions">
                      {controlActions
                        .filter((action) => !action.startsWith("summon_"))
                        .map((action) => (
                        <button
                          className={`office-control__action${currentActorState?.mode === "manual" && currentActorState.action === action ? " office-control__action--selected" : ""}`}
                          disabled={sharedMeetingActive}
                          key={action}
                          onClick={() => void setOfficeCommand(action)}
                          type="button"
                        >
                          {t(controlLabels[action])}
                        </button>
                      ))}
                    </div>
                    {controlActions.some((action) =>
                      action.startsWith("summon_"),
                    ) && (
                      <>
                        <p className="office-scene__quick-actions-label">
                          {t("SCENE EFFECTS")}
                        </p>
                        <div className="office-control__actions office-scene__effect-actions">
                          {controlActions
                            .filter((action) => action.startsWith("summon_"))
                            .map((action) => (
                              <button
                                className="office-control__action"
                                key={action}
                                onClick={() => setOfficeCommand(action)}
                                type="button"
                              >
                                {t(controlLabels[action])}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                    {officeActionError && (
                      <p className="office-control__error" role="alert">
                        {t(officeActionError)}
                      </p>
                    )}
                    <div className="office-scene__quick-status">
                      <div className="office-scene__quick-status-heading">
                        <span>{t("Recent local actions")}</span>
                        <small>{t("THIS DEVICE")}</small>
                      </div>
                      {localControlEvents.length ? (
                        <ul>
                          {localControlEvents.map((event) => (
                            <li key={event.id}>
                              <span>{t(event.detail)}</span>
                              <small>
                                {new Date(event.created_at).toLocaleTimeString(
                                  language === "vi" ? "vi-VN" : "en-US",
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </small>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="office-scene__quick-empty">
                          {t("No local actions yet.")}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
              <button
                aria-label={t(isFullscreen ? "Exit fullscreen" : "Fullscreen")}
                className="office-scene__fullscreen"
                onClick={() => void toggleFullscreen()}
                title={t(isFullscreen ? "Exit fullscreen" : "Fullscreen")}
                type="button"
              >
                <span aria-hidden="true">{isFullscreen ? "⤢" : "⛶"}</span>
                <span className="office-scene__fullscreen-label">
                  {t(isFullscreen ? "Exit fullscreen" : "Fullscreen")}
                </span>
              </button>
              {fullscreenError && (
                <span className="office-scene__fullscreen-error" role="status">
                  {fullscreenError}
                </span>
              )}
            </div>
            <span className="office-scene__gesture-hint">
              {t(
                cameraAnchorMode === "free"
                  ? "Drag to move · scroll to zoom"
                  : "Drag to rotate · scroll to zoom",
              )}
            </span>
            <div className="office-scene__fallback">
              <strong>3D preview unavailable</strong>
              <span>
                Enable WebGL or use the room directory to open a workspace.
              </span>
            </div>
            <div className="office-scene__compass" aria-hidden="true">
              <span>N</span>
              <i>↑</i>
            </div>
            <div className="office-scene__legend">
              <span><i className="office-legend__person" /> {t("Simulated profiles")}</span>
              <span><i className="office-legend__room" /> Select a room</span>
            </div>
          </div>
          <div className="office-scene__footer">
            <span>{t("ROOFTOP VIEW · INTERACTIVE FLOOR PLAN")}</span>
            <span>{t("150 m² · SCALE MODEL 1:1.53")}</span>
            <span>DRIKAPEX INTERNAL</span>
          </div>
        </div>

        <aside className="office-directory">
          <div className="office-directory__header">
            <span className="eyebrow">LIVE DIRECTORY</span>
            <h3>On the floor</h3>
            <p>{t("Active profiles; online status reflects recent connections.")}</p>
            {presence.error && <p role="status">{t("Online status could not be updated.")}</p>}
          </div>
          {currentMember && (
            <div className="office-you-card">
              <span className="office-avatar" style={{ backgroundColor: colorForMember(currentMember.id) }}>
                {currentMember.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <small>YOU ARE HERE</small>
                <strong>{currentMember.name}</strong>
                <span>{currentMember.position}</span>
              </span>
              <i className={!presence.available ? "office-presence--unknown" : isOnline(currentMember.id) ? "" : "office-presence--offline"}
                aria-label={presenceLabel(currentMember.id)} title={presenceLabel(currentMember.id)} />
            </div>
          )}
          {currentMember && (
            <section className="office-control" aria-labelledby="office-control-title">
              <div className="office-control__heading">
                <div>
                  <span className="eyebrow">
                    {t(controlActions.length > 0 ? "PERSONAL CONTROLS" : "OFFICE STATUS")}
                  </span>
                  <h4 id="office-control-title">
                    {t(controlActions.length > 0 ? "Your office mode" : "Office activity")}
                  </h4>
                </div>
                <span className="office-scene__local-badge">
                  <i aria-hidden="true" />
                  {t("LOCAL ONLY")}
                </span>
              </div>
              {controlActions.length > 0 && (
                <>
                  <p className="office-control__mode">
                    {currentActorState?.mode === "manual"
                      ? `${t("Manual control")} · ${t("returns to automatic in")} ${currentActorState.expires_at ? getRemainingTime(currentActorState.expires_at) : "5:00"}`
                      : t("Automatic mode")}
                  </p>
                  <div className="office-control__actions">
                    <button
                      className="office-control__action office-control__action--auto"
                      disabled={currentActorState?.mode !== "manual"}
                      onClick={() => void setOfficeCommand("auto")}
                      type="button"
                    >
                      {t(controlLabels.auto)}
                    </button>
                    {controlActions.map((action) => (
                      <button
                        className={`office-control__action${currentActorState?.mode === "manual" && currentActorState.action === action ? " office-control__action--selected" : ""}`}
                        key={action}
                        onClick={() => void setOfficeCommand(action)}
                        type="button"
                      >
                        {t(controlLabels[action])}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {sharedMeetingActive && (
                <p className="office-control__mode">
                  <strong>
                    {t("Team meeting in progress")}
                    {effectiveMeeting?.meeting_expires_at &&
                      ` · ${getRemainingTime(effectiveMeeting.meeting_expires_at)}`}
                  </strong>
                </p>
              )}
              {officeSyncError && (
                <p className="office-control__error" role="alert">
                  {t(officeSyncError)}
                </p>
              )}
              <div className="office-control__activity">
                <div className="office-control__activity-heading">
                  <span>{t("Recent activity")}</span>
                  <small>{t("LIVE STATUS")}</small>
                </div>
                {officeActivityEvents.length ? (
                  <ol>
                    {officeActivityEvents.slice(0, 5).map((event) => (
                      <li key={event.id}>
                        <time dateTime={event.created_at}>
                          {new Date(event.created_at).toLocaleTimeString(
                            language === "vi" ? "vi-VN" : "en-US",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </time>
                        <span>
                          <strong>{event.actor_username}</strong>
                          <small>
                            {getOfficeStatusLabel(event.status)}
                            {getOfficeStatusLabel(event.activity_detail || event.status) !==
                              getOfficeStatusLabel(event.status) &&
                              ` · ${getOfficeStatusLabel(event.activity_detail || event.status)}`}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>{t("No shared activity has been recorded yet.")}</p>
                )}
              </div>
            </section>
          )}
          <div className="office-members">
            {visibleMembers.map((member, index) => {
              const memberState = officeActorStates.find(
                (state) => state.actor_user_id === member.id,
              );
              return (
              <div
                className={`office-member${member.id === currentUserId ? " office-member--current" : ""}`}
                key={member.id}
              >
                <span className="office-member__avatar" style={{ backgroundColor: colorForMember(member.id) }}>
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="office-member__copy">
                  <strong>{member.name}</strong>
                  <small>{member.position} · {presenceLabel(member.id)}</small>
                  <span className="office-member__activity">
                    {presence.available && isOnline(member.id) && getOfficeStatusLabel(
                      memberState?.activity_detail ||
                        memberState?.status ||
                        "automatic",
                    )}
                  </span>
                </span>
                <span className={`office-member__status${!presence.available ? " office-presence--unknown" : isOnline(member.id) ? "" : " office-presence--offline"}`}
                  aria-label={presenceLabel(member.id)} title={presenceLabel(member.id)} />
                <span className="office-member__floor">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              );
            })}
            {memberError && (
              <div className="office-members__empty office-members__empty--error" role="alert">
                <span className="office-members__empty-mark">!</span>
                <strong>Directory unavailable</strong>
                <p>{memberError}</p>
              </div>
            )}
            {!memberError && members.length === 0 && (
              <div className="office-members__empty">
                <span className="office-members__empty-mark">◎</span>
                <strong>No active members yet</strong>
                <p>
                  Link active profiles to employee records and grant
                  personnel.view to display names in the office.
                </p>
              </div>
            )}
          </div>
          <div className="office-directory__rooms">
            <div className="office-directory__rooms-heading">
              <span className="eyebrow">EXPLORE SPACES</span>
              <span>{zones.length} AREAS</span>
            </div>
            {zones.slice(0, 5).map((zone, index) => (
              <button
                className="office-room-link"
                key={zone.id}
                onClick={() => onSelect(zone.destination)}
                type="button"
              >
                <span className="office-room-link__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="office-room-link__swatch" style={{ backgroundColor: zone.color }} />
                <span className="office-room-link__copy">
                  <strong>{t(zone.name)}</strong>
                  <small>{t(zone.subtitle)}</small>
                </span>
                <span className="office-room-link__arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <div className="office-directory__privacy">
            <span aria-hidden="true">◈</span>
            Names appear only for active profiles visible under Supabase RLS.
          </div>
        </aside>
      </div>
      <div className="office-experience__note">
        <span className="office-experience__note-icon" aria-hidden="true">✦</span>
        <span>
          <strong>A living workspace</strong>
          <small>Characters represent active account profiles. Their motion is illustrative; access remains controlled by Supabase.</small>
        </span>
        <span className="office-experience__note-count">
          {members.length} ACTIVE {members.length === 1 ? "PROFILE" : "PROFILES"}
        </span>
      </div>
    </div>
  );
}
