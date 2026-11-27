export type ActorActionActivity =
  | "working"
  | "chatting"
  | "eating"
  | "sleeping";

export const riderActionSets = {
  courier: ["phone-check", "dismount", "handoff", "mount", "cruise"],
  motorcyclist: ["cruise", "steer", "balance", "brake"],
  police: ["patrol", "police-pursuit", "signal", "escort", "passenger"],
} as const;

export type ActorActionMotion =
  | "typing"
  | "mouse"
  | "reading"
  | "writing"
  | "paperwork"
  | "calculator"
  | "thinking"
  | "adjusting"
  | "organizing"
  | "nod"
  | "explaining"
  | "listening"
  | "pointing"
  | "greeting"
  | "sip"
  | "bite"
  | "chewing"
  | "napkin"
  | "breathing"
  | "sleep_shift";

export type ActorAction = {
  id: string;
  activity: ActorActionActivity;
  motion: ActorActionMotion;
  intensity: number;
  tempo: number;
  variation?: number;
};

export type ActorActionPose = {
  leftArmX: number;
  rightArmX: number;
  leftArmZ: number;
  rightArmZ: number;
  leftForearmX: number;
  rightForearmX: number;
  headX: number;
  headY: number;
  headZ: number;
  bodyX: number;
  bodyZ: number;
  leftWristZ: number;
  rightWristZ: number;
};

const baseActorActions = [
  { id: "typing_burst", activity: "working", motion: "typing", intensity: 0.7, tempo: 1.2 },
  { id: "steady_typing", activity: "working", motion: "typing", intensity: 0.45, tempo: 0.8 },
  { id: "mouse_click", activity: "working", motion: "mouse", intensity: 0.4, tempo: 1.3 },
  { id: "scroll_review", activity: "working", motion: "mouse", intensity: 0.3, tempo: 0.7 },
  { id: "screen_read", activity: "working", motion: "reading", intensity: 0.25, tempo: 0.65 },
  { id: "lean_review", activity: "working", motion: "reading", intensity: 0.5, tempo: 0.55 },
  { id: "write_notes", activity: "working", motion: "writing", intensity: 0.55, tempo: 0.9 },
  { id: "mark_document", activity: "working", motion: "writing", intensity: 0.35, tempo: 0.7 },
  { id: "turn_page", activity: "working", motion: "paperwork", intensity: 0.6, tempo: 0.8 },
  { id: "review_printout", activity: "working", motion: "paperwork", intensity: 0.4, tempo: 0.55 },
  { id: "file_documents", activity: "working", motion: "organizing", intensity: 0.5, tempo: 0.75 },
  { id: "use_calculator", activity: "working", motion: "calculator", intensity: 0.35, tempo: 0.9 },
  { id: "consider_numbers", activity: "working", motion: "thinking", intensity: 0.35, tempo: 0.5 },
  { id: "adjust_cuff", activity: "working", motion: "adjusting", intensity: 0.4, tempo: 0.6 },
  { id: "straighten_tie", activity: "working", motion: "adjusting", intensity: 0.3, tempo: 0.45 },
  { id: "rearrange_files", activity: "working", motion: "organizing", intensity: 0.65, tempo: 0.6 },
  { id: "stamp_form", activity: "working", motion: "paperwork", intensity: 0.7, tempo: 1.1 },
  { id: "pick_up_folder", activity: "working", motion: "paperwork", intensity: 0.55, tempo: 0.7 },
  { id: "set_down_folder", activity: "working", motion: "paperwork", intensity: 0.45, tempo: 0.65 },
  { id: "chair_adjustment", activity: "working", motion: "thinking", intensity: 0.2, tempo: 0.35 },
  { id: "explain_with_palm", activity: "chatting", motion: "explaining", intensity: 0.7, tempo: 0.9 },
  { id: "emphasize_point", activity: "chatting", motion: "pointing", intensity: 0.55, tempo: 0.8 },
  { id: "attentive_nod", activity: "chatting", motion: "nod", intensity: 0.35, tempo: 0.55 },
  { id: "tilt_to_listen", activity: "chatting", motion: "listening", intensity: 0.3, tempo: 0.45 },
  { id: "agree_slightly", activity: "chatting", motion: "nod", intensity: 0.22, tempo: 0.4 },
  { id: "gesture_to_colleague", activity: "chatting", motion: "explaining", intensity: 0.45, tempo: 0.6 },
  { id: "hands_together", activity: "chatting", motion: "listening", intensity: 0.18, tempo: 0.3 },
  { id: "indicate_screen", activity: "chatting", motion: "pointing", intensity: 0.65, tempo: 0.7 },
  { id: "pass_a_document", activity: "chatting", motion: "paperwork", intensity: 0.6, tempo: 0.65 },
  { id: "brief_greeting", activity: "chatting", motion: "greeting", intensity: 0.65, tempo: 0.8 },
  { id: "thoughtful_pause", activity: "chatting", motion: "thinking", intensity: 0.3, tempo: 0.4 },
  { id: "shift_in_chair", activity: "chatting", motion: "listening", intensity: 0.25, tempo: 0.5 },
  { id: "look_to_colleague", activity: "chatting", motion: "nod", intensity: 0.45, tempo: 0.6 },
  { id: "conversational_gesture", activity: "chatting", motion: "explaining", intensity: 0.8, tempo: 1.15 },
  { id: "lean_back_reply", activity: "chatting", motion: "thinking", intensity: 0.4, tempo: 0.5 },
  { id: "raise_cup", activity: "eating", motion: "sip", intensity: 0.55, tempo: 0.55 },
  { id: "sip_drink", activity: "eating", motion: "sip", intensity: 0.75, tempo: 0.4 },
  { id: "set_cup_down", activity: "eating", motion: "sip", intensity: 0.35, tempo: 0.7 },
  { id: "take_a_bite", activity: "eating", motion: "bite", intensity: 0.65, tempo: 0.6 },
  { id: "chew_food", activity: "eating", motion: "chewing", intensity: 0.3, tempo: 0.8 },
  { id: "inspect_meal", activity: "eating", motion: "reading", intensity: 0.22, tempo: 0.45 },
  { id: "reach_for_plate", activity: "eating", motion: "bite", intensity: 0.7, tempo: 0.7 },
  { id: "use_cutlery", activity: "eating", motion: "bite", intensity: 0.4, tempo: 0.9 },
  { id: "savor_a_pause", activity: "eating", motion: "chewing", intensity: 0.25, tempo: 0.35 },
  { id: "use_napkin", activity: "eating", motion: "napkin", intensity: 0.55, tempo: 0.5 },
  { id: "sleep_breathing", activity: "sleeping", motion: "breathing", intensity: 0.18, tempo: 0.28 },
  { id: "sleep_head_bob", activity: "sleeping", motion: "sleep_shift", intensity: 0.3, tempo: 0.2 },
  { id: "sleep_small_shift", activity: "sleeping", motion: "sleep_shift", intensity: 0.22, tempo: 0.34 },
  { id: "sleep_adjust_arm", activity: "sleeping", motion: "sleep_shift", intensity: 0.4, tempo: 0.18 },
  { id: "sleep_deep_breath", activity: "sleeping", motion: "breathing", intensity: 0.28, tempo: 0.16 },
] as const satisfies readonly ActorAction[];

const actionVariations = [
  { suffix: "soft", intensity: 0.82, tempo: 0.88 },
  { suffix: "natural", intensity: 1, tempo: 1 },
  { suffix: "expressive", intensity: 1.14, tempo: 1.12 },
] as const;

export const actorActions: readonly ActorAction[] = baseActorActions.flatMap(
  (action) =>
    actionVariations.map((variation, index) => ({
      ...action,
      id: `${action.id}_${variation.suffix}`,
      intensity: action.intensity * variation.intensity,
      tempo: action.tempo * variation.tempo,
      variation: index,
    })),
);

export function chooseActorAction(
  activity: ActorActionActivity,
  previousActionId: string | null,
  random: () => number = Math.random,
): ActorAction {
  const available = actorActions.filter(
    (action) =>
      action.activity === activity && action.id !== previousActionId,
  );
  const actions =
    available.length > 0
      ? available
      : actorActions.filter((action) => action.activity === activity);
  const index = Math.min(actions.length - 1, Math.floor(random() * actions.length));
  return actions[index];
}

export function getActorActionPose(
  action: ActorAction,
  phase: number,
): ActorActionPose {
  const wave = Math.sin(phase * action.tempo);
  const pulse = Math.sin(phase * action.tempo * 3);
  const strength = action.intensity;
  const variation = action.variation ?? 1;
  const pose: ActorActionPose = {
    leftArmX: -0.34,
    rightArmX: -0.34,
    leftArmZ: -0.04,
    rightArmZ: 0.04,
    leftForearmX: -0.38,
    rightForearmX: -0.38,
    headX: 0.04,
    headY: Math.sin(phase * 0.31) * 0.018 * variation,
    headZ: 0,
    bodyX: 0,
    bodyZ: Math.sin(phase * 0.43) * 0.008 * variation,
    leftWristZ: 0,
    rightWristZ: 0,
  };

  switch (action.motion) {
    case "typing":
      pose.leftArmX = pose.rightArmX = -0.43 + pulse * 0.035 * strength;
      pose.leftForearmX = -1.02 + pulse * 0.08 * strength;
      pose.rightForearmX = -1.02 - pulse * 0.08 * strength;
      pose.headX = 0.09;
      break;
    case "mouse":
      pose.leftArmX = -0.38;
      pose.rightArmX = -0.3 + Math.max(0, wave) * 0.13 * strength;
      pose.leftForearmX = -0.58;
      pose.rightForearmX = -0.72 + pulse * 0.14 * strength;
      pose.headX = 0.07;
      break;
    case "reading":
      pose.leftArmX = pose.rightArmX = -0.38;
      pose.leftForearmX = pose.rightForearmX = -0.58;
      pose.headX = 0.15 + Math.abs(wave) * 0.04 * strength;
      pose.headZ = wave * 0.035;
      break;
    case "writing":
      pose.leftArmX = -0.4;
      pose.rightArmX = -0.3 + pulse * 0.05 * strength;
      pose.leftForearmX = -0.62;
      pose.rightForearmX = -0.86 + pulse * 0.16 * strength;
      pose.headX = 0.12;
      break;
    case "paperwork":
      pose.leftArmX = -0.36 + Math.max(0, wave) * 0.14 * strength;
      pose.rightArmX = -0.35 + Math.max(0, -wave) * 0.12 * strength;
      pose.leftForearmX = -0.58 - Math.max(0, -wave) * 0.3 * strength;
      pose.rightForearmX = -0.58 - Math.max(0, wave) * 0.3 * strength;
      pose.headX = 0.1;
      break;
    case "calculator":
      pose.leftArmX = -0.34;
      pose.rightArmX = -0.32;
      pose.leftForearmX = -0.66;
      pose.rightForearmX = -0.8 + pulse * 0.12 * strength;
      pose.headX = 0.12;
      break;
    case "thinking":
      pose.leftArmX = -0.24;
      pose.rightArmX = -0.38;
      pose.leftForearmX = -0.45;
      pose.rightForearmX = -0.9;
      pose.headX = 0.1;
      pose.headZ = wave * 0.06 * strength;
      pose.bodyX = -0.025;
      break;
    case "adjusting":
      pose.leftArmX = -0.22 + Math.max(0, wave) * 0.28 * strength;
      pose.rightArmX = -0.22 + Math.max(0, -wave) * 0.28 * strength;
      pose.leftForearmX = -0.7;
      pose.rightForearmX = -0.7;
      pose.headX = 0.02;
      break;
    case "organizing":
      pose.leftArmX = -0.25 + Math.max(0, wave) * 0.28 * strength;
      pose.rightArmX = -0.25 + Math.max(0, -wave) * 0.28 * strength;
      pose.leftArmZ = -0.1;
      pose.rightArmZ = 0.1;
      pose.leftForearmX = -0.55 - Math.max(0, wave) * 0.22;
      pose.rightForearmX = -0.55 - Math.max(0, -wave) * 0.22;
      pose.headX = 0.08;
      break;
    case "nod":
      pose.leftArmX = pose.rightArmX = -0.25;
      pose.leftForearmX = pose.rightForearmX = -0.3;
      pose.headX = 0.03 + Math.max(0, wave) * 0.16 * strength;
      pose.headZ = Math.sin(phase * 0.6) * 0.035;
      break;
    case "explaining":
      pose.leftArmX = -0.28 + Math.max(0, wave) * 0.22 * strength;
      pose.rightArmX = -0.28 + Math.max(0, -wave) * 0.22 * strength;
      pose.leftArmZ = -0.12 - Math.max(0, wave) * 0.22 * strength;
      pose.rightArmZ = 0.12 + Math.max(0, -wave) * 0.22 * strength;
      pose.leftForearmX = -0.5;
      pose.rightForearmX = -0.5;
      pose.headX = 0.015;
      pose.headZ = wave * 0.035;
      break;
    case "listening":
      pose.leftArmX = pose.rightArmX = -0.2;
      pose.leftForearmX = pose.rightForearmX = -0.42;
      pose.headX = 0.04;
      pose.headZ = Math.sin(phase * 0.5) * 0.065 * strength;
      break;
    case "pointing":
      pose.leftArmX = -0.24;
      pose.rightArmX = -0.2 - Math.max(0, wave) * 0.38 * strength;
      pose.leftForearmX = -0.3;
      pose.rightForearmX = -0.4;
      pose.rightArmZ = 0.12;
      pose.headZ = -0.04;
      break;
    case "greeting":
      pose.leftArmX = -0.2;
      pose.rightArmX = -0.1 - Math.max(0, wave) * 0.58 * strength;
      pose.rightArmZ = 0.22;
      pose.rightForearmX = -0.45 + pulse * 0.32 * strength;
      pose.headX = -0.015;
      break;
    case "sip":
      pose.leftArmX = -0.22;
      pose.rightArmX = -0.72;
      pose.leftForearmX = -0.35;
      pose.rightForearmX = -0.92 + Math.max(0, wave) * 0.12;
      pose.headX = 0.06 + Math.max(0, wave) * 0.07;
      break;
    case "bite":
      pose.leftArmX = -0.22;
      pose.rightArmX = -0.56 - Math.max(0, wave) * 0.16;
      pose.leftForearmX = -0.34;
      pose.rightForearmX = -0.86;
      pose.headX = 0.12;
      break;
    case "chewing":
      pose.leftArmX = pose.rightArmX = -0.18;
      pose.leftForearmX = pose.rightForearmX = -0.25;
      pose.headX = 0.08 + Math.abs(wave) * 0.045 * strength;
      break;
    case "napkin":
      pose.leftArmX = -0.22;
      pose.rightArmX = -0.68 + wave * 0.08 * strength;
      pose.leftForearmX = -0.3;
      pose.rightForearmX = -0.9;
      pose.headX = 0.06;
      break;
    case "breathing":
      pose.leftArmX = pose.rightArmX = -0.2;
      pose.leftForearmX = pose.rightForearmX = -0.2;
      pose.bodyX = Math.sin(phase * action.tempo) * 0.018 * strength;
      pose.headX = 0.32 + Math.sin(phase * action.tempo) * 0.025;
      break;
    case "sleep_shift":
      pose.leftArmX = -0.84 + wave * 0.08 * strength;
      pose.rightArmX = -0.84 - wave * 0.08 * strength;
      pose.leftForearmX = pose.rightForearmX = -0.25;
      pose.bodyX = 0.025 + wave * 0.025 * strength;
      pose.headX = 0.3 + wave * 0.05 * strength;
      pose.headZ = wave * 0.06 * strength;
      break;
  }

  pose.headY += wave * 0.022 * strength;
  pose.bodyZ += Math.sin(phase * action.tempo * 0.5) * 0.012 * strength;
  pose.leftWristZ = Math.sin(phase * action.tempo * 2.2) * 0.045 * strength;
  pose.rightWristZ =
    Math.sin(phase * action.tempo * 2.2 + 0.8) * 0.045 * strength;
  if (variation === 0) {
    pose.headY *= 0.65;
    pose.bodyZ *= 0.7;
  } else if (variation === 2) {
    pose.headZ += Math.sin(phase * 0.47) * 0.025 * strength;
    pose.bodyZ += Math.sin(phase * 0.37 + 1.1) * 0.012 * strength;
  }

  return pose;
}
