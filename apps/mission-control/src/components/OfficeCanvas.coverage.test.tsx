import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  OfficeCanvas,
  type OfficeCollaborationEdge,
  type OfficeDeskAgent,
  type OfficeOperatorModel,
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
          showCollabOverlay
          idleMillingEnabled
          collaborationEdges={edges}
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
          showCollabOverlay={false}
          idleMillingEnabled={false}
          collaborationEdges={[]}
        />,
      );
    });
    expect(renderer.toJSON()).toBeTruthy();
    renderer.unmount();
  });
});
