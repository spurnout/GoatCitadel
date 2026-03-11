import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  OfficeCanvas,
  type OfficeCollaborationEdge,
  type OfficeDeskAgent,
  type OfficeOperatorModel,
  type OfficeSignalRoute,
  type OfficeZoneActivityLane,
  type OfficeZoneSceneTelemetry,
} from "./OfficeCanvas";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children, onPointerMissed }: { children: React.ReactNode; onPointerMissed?: () => void }) => (
    <div
      onClick={() => {
        onPointerMissed?.();
      }}
    >
      {children}
    </div>
  ),
  useFrame: (callback: (state: { clock: { elapsedTime: number } }) => void) => {
    callback({ clock: { elapsedTime: 1.2 } });
  },
  useThree: () => ({
    camera: {
      position: {
        lerp: () => undefined,
      },
      lookAt: () => undefined,
    },
  }),
}));

vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  OrbitControls: () => <div />,
}));

const operator: OfficeOperatorModel = {
  operatorId: "operator-1",
  name: "GoatHerder",
  preset: "trailblazer",
  currentThought: "Routing next work wave.",
  activityState: "idle_patrol",
};

const agents: OfficeDeskAgent[] = Array.from({ length: 14 }, (_, index) => ({
  roleId: `agent-${index + 1}`,
  name: `Agent ${index + 1}`,
  title: `Role ${index + 1}`,
  status: index % 3 === 0 ? "active" : index % 3 === 1 ? "ready" : "idle",
  risk: index % 4 === 0 ? "approval" : index % 4 === 1 ? "blocked" : index % 4 === 2 ? "error" : "none",
  currentThought: `Thought ${index + 1}`,
  currentAction: `Action ${index + 1}`,
  activityState: index % 3 === 0
    ? "idle_milling"
    : index % 3 === 1
      ? "transitioning_to_desk"
      : "collaborating",
  collabPeers: index > 0 ? [`agent-${index}`] : [],
}));

const edges: OfficeCollaborationEdge[] = [
  { fromRoleId: "agent-1", toRoleId: "agent-2", strength: 0.8, risk: false },
  { fromRoleId: "agent-3", toRoleId: "agent-4", strength: 0.6, risk: true },
];

const zoneTelemetry: OfficeZoneSceneTelemetry[] = [
  {
    zoneId: "command",
    label: "Command",
    activeAgents: 1,
    linkedAgents: 1,
    alertAgents: 0,
    attentionLevel: "watch",
    workloadScore: 0.52,
    landmark: "Command spire",
  },
  {
    zoneId: "research",
    label: "Research",
    activeAgents: 1,
    linkedAgents: 1,
    alertAgents: 0,
    attentionLevel: "stable",
    workloadScore: 0.38,
    landmark: "Signal halo",
  },
];

const activityLanes: OfficeZoneActivityLane[] = [
  {
    fromZoneId: "command",
    toZoneId: "research",
    fromLabel: "Command",
    toLabel: "Research",
    strength: 0.72,
    count: 3,
    risk: false,
    label: "Command and research are exchanging live work.",
  },
];

const signalRoutes: OfficeSignalRoute[] = [
  {
    roleId: "agent-1",
    zoneId: "command",
    kind: "approval",
    label: "Agent 1 needs review",
    intensity: 0.82,
  },
];

describe("OfficeCanvas coverage", () => {
  it("renders command bridge scene with procedural geometry", async () => {
    let renderer = create(<div />);
    await act(async () => {
      renderer = create(
        <OfficeCanvas
          operator={operator}
          agents={agents}
          selectedEntityId="agent-1"
          onSelect={() => undefined}
          assetPack={{ operatorModelPath: "/assets/operator.glb", goatModelPath: "/assets/goat.glb" }}
          motionMode="cinematic"
          focusMode={false}
          quietMode={false}
          followSelection={false}
          sceneBusy={false}
          showCollabOverlay
          idleMillingEnabled
          collaborationEdges={edges}
          zoneTelemetry={zoneTelemetry}
          activityLanes={activityLanes}
          signalRoutes={signalRoutes}
        />,
      );
    });
    await act(async () => {
      renderer.root.findByType("div").props.onClick?.();
    });
    expect(renderer.toJSON()).toBeTruthy();
    renderer.unmount();
  });

  it("renders reduced-motion scene without collaboration overlay", async () => {
    let renderer = create(<div />);
    await act(async () => {
      renderer = create(
        <OfficeCanvas
          operator={{ ...operator, preset: "nightwatch", activityState: "command_center" }}
          agents={agents.map((agent) => ({ ...agent, activityState: "working_seated" }))}
          selectedEntityId="operator"
          onSelect={() => undefined}
          motionMode="reduced"
          focusMode
          focusedZoneId="research"
          quietMode
          followSelection
          sceneBusy
          showCollabOverlay={false}
          idleMillingEnabled={false}
          collaborationEdges={[]}
          zoneTelemetry={zoneTelemetry}
          activityLanes={activityLanes}
          signalRoutes={signalRoutes}
        />,
      );
    });
    expect(renderer.toJSON()).toBeTruthy();
    renderer.unmount();
  });
});
