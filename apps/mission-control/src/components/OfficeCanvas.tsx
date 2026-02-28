import { Clone, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, Suspense, useMemo, useRef, useState } from "react";
import type { Group } from "three";

// All scene dimensions are in meters to enforce consistent scale.
const METER = 1;
const FLOOR_SIZE = 18 * METER;
const WALL_HEIGHT = 3.2 * METER;
const DESK_RING_MIN_RADIUS = 4.4 * METER;
const DESK_RING_MAX_RADIUS = 6.2 * METER;

export type OperatorPreset = "trailblazer" | "strategist" | "nightwatch";

export interface OfficeOperatorModel {
  operatorId: string;
  name: string;
  preset: OperatorPreset;
  currentThought: string;
}

export interface OfficeDeskAgent {
  roleId: string;
  name: string;
  title: string;
  status: "active" | "idle" | "ready";
  risk: "none" | "approval" | "blocked" | "error";
  currentThought: string;
  currentAction?: string;
  lastSeenAt?: string;
}

interface OfficeAssetPack {
  operatorModelPath?: string;
  goatModelPath?: string;
}

interface OfficeCanvasProps {
  operator: OfficeOperatorModel;
  agents: OfficeDeskAgent[];
  selectedEntityId: string;
  onSelect: (entityId: string) => void;
  assetPack?: OfficeAssetPack;
}

interface DeskAgentLayout extends OfficeDeskAgent {
  position: [number, number, number];
  rotationY: number;
}

export const OfficeCanvas = memo(function OfficeCanvas(props: OfficeCanvasProps) {
  const layout = useMemo(() => buildRadialLayout(props.agents), [props.agents]);

  return (
    <div className="office-webgl-stage">
      <Canvas
        camera={{ position: [0, 6.6, 11.2], fov: 42 }}
        shadows
        dpr={[1, 1.8]}
        onPointerMissed={() => props.onSelect("operator")}
      >
        <color attach="background" args={["#1f1f1d"]} />
        <fog attach="fog" args={["#1f1f1d", 15, 32]} />

        <ambientLight intensity={0.45} color="#f4f1eb" />
        <hemisphereLight color="#f7f5ef" groundColor="#5f5950" intensity={0.32} />
        <directionalLight
          position={[7, 11, 6]}
          intensity={0.9}
          color="#fffdf8"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight
          position={[-8, 5, -7]}
          intensity={0.3}
          color="#d6d0c8"
        />

        <OfficeRoom />

        <OperatorStation
          operator={props.operator}
          selected={props.selectedEntityId === "operator"}
          onSelect={props.onSelect}
          modelPath={props.assetPack?.operatorModelPath}
        />

        {layout.map((agent, index) => (
          <AgentStation
            key={agent.roleId}
            agent={agent}
            selected={props.selectedEntityId === agent.roleId}
            onSelect={props.onSelect}
            phaseOffset={index * 0.61}
            goatModelPath={props.assetPack?.goatModelPath}
          />
        ))}

        <OrbitControls
          makeDefault
          target={[0, 1.2, 0]}
          maxPolarAngle={Math.PI / 2.12}
          minPolarAngle={Math.PI / 5.2}
          minDistance={7.2}
          maxDistance={20}
          enablePan={false}
        />
      </Canvas>
    </div>
  );
});

function OfficeRoom() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color="#757167" roughness={0.9} metalness={0.04} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT / 2, -FLOOR_SIZE / 2]} receiveShadow>
        <boxGeometry args={[FLOOR_SIZE, WALL_HEIGHT, 0.2]} />
        <meshStandardMaterial color="#8b8478" roughness={0.92} />
      </mesh>

      <mesh position={[-FLOOR_SIZE / 2, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[0.2, WALL_HEIGHT, FLOOR_SIZE]} />
        <meshStandardMaterial color="#888074" roughness={0.9} />
      </mesh>

      <mesh position={[FLOOR_SIZE / 2, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[0.2, WALL_HEIGHT, FLOOR_SIZE]} />
        <meshStandardMaterial color="#888074" roughness={0.9} />
      </mesh>
    </group>
  );
}

function OperatorStation(props: {
  operator: OfficeOperatorModel;
  selected: boolean;
  onSelect: (entityId: string) => void;
  modelPath?: string;
}) {
  const avatarRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const preset = operatorPresetPalette(props.operator.preset);

  useFrame((state) => {
    if (!avatarRef.current) {
      return;
    }
    avatarRef.current.position.y = 0.87 + Math.sin(state.clock.elapsedTime * 1.2) * 0.03;
    const pulse = props.selected ? 1.03 : 1;
    avatarRef.current.scale.setScalar(pulse + Math.sin(state.clock.elapsedTime * 2.4) * 0.0075);
  });

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    props.onSelect("operator");
  };

  return (
    <group
      position={[0, 0, 0]}
      onClick={onClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <ShadowBlob radius={1.1} opacity={0.24} />

      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1.08, 0.18, 36]} />
        <meshStandardMaterial color="#5e584e" roughness={0.84} />
      </mesh>

      <mesh position={[0, 0.82, -0.36]} castShadow>
        <boxGeometry args={[1.12, 0.55, 0.06]} />
        <meshStandardMaterial color="#3f3f3d" emissive={preset.accent} emissiveIntensity={0.18} />
      </mesh>

      <group ref={avatarRef} position={[0, 0.87, 0.12]}>
        <Suspense fallback={<ProceduralOperator preset={props.operator.preset} />}>
          {props.modelPath ? (
            <ModelClone path={props.modelPath} scale={0.8} rotationY={Math.PI} />
          ) : (
            <ProceduralOperator preset={props.operator.preset} />
          )}
        </Suspense>
      </group>

      <SelectionRing selected={props.selected} />

      {(props.selected || hovered) ? (
        <Html position={[0, 2.15, 0]} center distanceFactor={12} transform={false} occlude={false}>
          <div className={`office-thought-html ${props.selected ? "selected" : ""}`}>
            <p className="name">{props.operator.name}</p>
            <p className="thought">{truncate(props.operator.currentThought, 120)}</p>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function AgentStation(props: {
  agent: DeskAgentLayout;
  selected: boolean;
  onSelect: (entityId: string) => void;
  phaseOffset: number;
  goatModelPath?: string;
}) {
  const avatarRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [x, y, z] = props.agent.position;

  useFrame((state) => {
    if (!avatarRef.current) {
      return;
    }
    const bob = props.agent.status === "active" ? 0.06 : 0.03;
    avatarRef.current.position.y = 0.9 + Math.sin(state.clock.elapsedTime * 1.5 + props.phaseOffset) * bob;
    const scalePulse = props.selected ? 1.02 : 1;
    avatarRef.current.scale.setScalar(scalePulse + Math.sin(state.clock.elapsedTime * 2 + props.phaseOffset) * 0.005);
  });

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    props.onSelect(props.agent.roleId);
  };

  return (
    <group
      position={[x, y, z]}
      rotation={[0, props.agent.rotationY, 0]}
      onClick={onClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <ShadowBlob radius={0.98} opacity={0.2} />

      <DeskKit status={props.agent.status} risk={props.agent.risk} selected={props.selected} hovered={hovered} />

      <group ref={avatarRef} position={[0, 0.9, 0.18]}>
        <Suspense fallback={<ProceduralGoat status={props.agent.status} risk={props.agent.risk} />}>
          {props.goatModelPath ? (
            <ModelClone path={props.goatModelPath} scale={0.58} rotationY={Math.PI} />
          ) : (
            <ProceduralGoat status={props.agent.status} risk={props.agent.risk} />
          )}
        </Suspense>
      </group>

      <StatusBadge status={props.agent.status} risk={props.agent.risk} />
      <SelectionRing selected={props.selected} />

      {(props.selected || props.agent.status === "active" || hovered) ? (
        <Html position={[0, 2.02, 0]} center distanceFactor={11} transform={false} occlude={false}>
          <div className={`office-thought-html ${props.selected ? "selected" : ""}`}>
            <p className="name">{props.agent.name}</p>
            <p className="thought">{truncate(props.agent.currentThought, 100)}</p>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function DeskKit(props: {
  status: OfficeDeskAgent["status"];
  risk: OfficeDeskAgent["risk"];
  selected: boolean;
  hovered: boolean;
}) {
  const deskColor = deskTone(props.status, props.risk, props.selected, props.hovered);
  const screenColor = screenGlow(props.status, props.risk);

  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.95, 0.08, 1.28]} />
        <meshStandardMaterial color={deskColor} roughness={0.7} metalness={0.06} />
      </mesh>

      <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.22, 0.42, 0.24]} />
        <meshStandardMaterial color="#3f3d39" roughness={0.82} />
      </mesh>

      <mesh position={[0, 0.24, 0.54]} castShadow receiveShadow>
        <boxGeometry args={[0.64, 0.38, 0.62]} />
        <meshStandardMaterial color="#4d4a44" roughness={0.9} />
      </mesh>

      <mesh position={[0, 0.82, -0.4]} castShadow>
        <boxGeometry args={[1.04, 0.5, 0.06]} />
        <meshStandardMaterial color="#3a3935" roughness={0.45} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.82, -0.36]} castShadow>
        <boxGeometry args={[0.92, 0.38, 0.02]} />
        <meshStandardMaterial color="#0e1518" emissive={screenColor} emissiveIntensity={0.52} />
      </mesh>

      <mesh position={[0, 0.46, -0.08]} castShadow>
        <boxGeometry args={[0.7, 0.02, 0.24]} />
        <meshStandardMaterial color="#3d3a35" roughness={0.5} metalness={0.2} />
      </mesh>

      <DeskClutter status={props.status} risk={props.risk} />
    </group>
  );
}

function DeskClutter(props: {
  status: OfficeDeskAgent["status"];
  risk: OfficeDeskAgent["risk"];
}) {
  if (props.risk === "blocked" || props.risk === "error") {
    return (
      <group position={[0.54, 0.52, -0.05]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.08, 16]} />
          <meshStandardMaterial color="#3f3933" />
        </mesh>
        <mesh position={[0, 0.07, 0]} castShadow>
          <coneGeometry args={[0.05, 0.11, 16]} />
          <meshStandardMaterial color="#bf4f47" emissive="#bf4f47" emissiveIntensity={0.45} />
        </mesh>
      </group>
    );
  }

  if (props.risk === "approval") {
    return (
      <group position={[0.52, 0.48, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.12, 0.04, 0.14]} />
          <meshStandardMaterial color="#d4c8ad" />
        </mesh>
        <mesh position={[0, 0.035, 0]} castShadow>
          <boxGeometry args={[0.1, 0.03, 0.12]} />
          <meshStandardMaterial color="#efe4ca" />
        </mesh>
      </group>
    );
  }

  if (props.status === "active") {
    return (
      <mesh position={[0.54, 0.5, 0.05]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.1, 14]} />
        <meshStandardMaterial color="#c8cbc6" />
      </mesh>
    );
  }

  if (props.status === "ready") {
    return (
      <group position={[0.52, 0.48, 0.02]}>
        <mesh castShadow>
          <boxGeometry args={[0.12, 0.03, 0.16]} />
          <meshStandardMaterial color="#dfd6bf" />
        </mesh>
        <mesh position={[0, 0.025, 0]} castShadow>
          <boxGeometry args={[0.11, 0.03, 0.15]} />
          <meshStandardMaterial color="#eee7d2" />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[0.54, 0.5, 0.03]} castShadow>
      <boxGeometry args={[0.12, 0.02, 0.17]} />
      <meshStandardMaterial color="#383735" />
    </mesh>
  );
}

function StatusBadge(props: {
  status: OfficeDeskAgent["status"];
  risk: OfficeDeskAgent["risk"];
}) {
  const badge = statusBadge(props.status, props.risk);
  return (
    <Html position={[0, 1.73, -0.05]} center distanceFactor={11} transform={false} occlude={false}>
      <div className={`office-status-chip office-status-${badge.kind}`}>
        {badge.label}
      </div>
    </Html>
  );
}

function SelectionRing(props: { selected: boolean }) {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <ringGeometry args={[0.94, 1.1, 40]} />
      <meshStandardMaterial
        color={props.selected ? "#ffddaf" : "#4b4943"}
        emissive={props.selected ? "#ffca87" : "#2b2a27"}
        emissiveIntensity={props.selected ? 0.33 : 0.04}
        side={2}
      />
    </mesh>
  );
}

function ShadowBlob(props: { radius: number; opacity: number }) {
  return (
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[props.radius, 32]} />
      <meshBasicMaterial color="#000000" transparent opacity={props.opacity} depthWrite={false} />
    </mesh>
  );
}

function ModelClone(props: {
  path: string;
  scale: number;
  rotationY?: number;
}) {
  const gltf = useGLTF(props.path);
  return (
    <Clone
      object={gltf.scene}
      scale={props.scale}
      rotation={[0, props.rotationY ?? 0, 0]}
    />
  );
}

function ProceduralOperator(props: { preset: OperatorPreset }) {
  const palette = operatorPresetPalette(props.preset);
  return (
    <group>
      <mesh position={[0, 0.48, 0]} castShadow>
        <capsuleGeometry args={[0.11, 0.34, 8, 16]} />
        <meshStandardMaterial color={palette.body} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.82, 0.01]} castShadow>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color={palette.skin} roughness={0.75} />
      </mesh>
      <mesh position={[-0.16, 0.5, 0]} rotation={[0, 0, 0.32]} castShadow>
        <capsuleGeometry args={[0.04, 0.2, 6, 10]} />
        <meshStandardMaterial color={palette.skin} />
      </mesh>
      <mesh position={[0.16, 0.5, 0]} rotation={[0, 0, -0.32]} castShadow>
        <capsuleGeometry args={[0.04, 0.2, 6, 10]} />
        <meshStandardMaterial color={palette.skin} />
      </mesh>
      <mesh position={[0, 0.96, 0.03]} castShadow>
        <boxGeometry args={[0.17, 0.03, 0.14]} />
        <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

function ProceduralGoat(props: {
  status: OfficeDeskAgent["status"];
  risk: OfficeDeskAgent["risk"];
}) {
  const coat = goatCoatColor(props.status, props.risk);
  return (
    <group>
      <mesh position={[0, 0.34, 0]} castShadow>
        <capsuleGeometry args={[0.14, 0.24, 8, 16]} />
        <meshStandardMaterial color={coat} roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.54, -0.17]} castShadow>
        <sphereGeometry args={[0.11, 14, 14]} />
        <meshStandardMaterial color={coat} roughness={0.62} />
      </mesh>
      <mesh position={[-0.06, 0.63, -0.2]} rotation={[0.8, 0, 0.2]} castShadow>
        <coneGeometry args={[0.02, 0.1, 10]} />
        <meshStandardMaterial color="#d8c8a4" />
      </mesh>
      <mesh position={[0.06, 0.63, -0.2]} rotation={[0.8, 0, -0.2]} castShadow>
        <coneGeometry args={[0.02, 0.1, 10]} />
        <meshStandardMaterial color="#d8c8a4" />
      </mesh>

      {[-0.08, 0.08].map((x) => (
        <mesh key={`front-leg-${x}`} position={[x, 0.15, 0.07]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.22, 10]} />
          <meshStandardMaterial color="#4a443d" />
        </mesh>
      ))}
      {[-0.08, 0.08].map((x) => (
        <mesh key={`rear-leg-${x}`} position={[x, 0.15, -0.07]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.22, 10]} />
          <meshStandardMaterial color="#4a443d" />
        </mesh>
      ))}
    </group>
  );
}

function buildRadialLayout(agents: OfficeDeskAgent[]): DeskAgentLayout[] {
  if (agents.length === 0) {
    return [];
  }
  const dynamicRadius = Math.min(
    DESK_RING_MAX_RADIUS,
    Math.max(DESK_RING_MIN_RADIUS, 3.2 + agents.length * 0.34),
  );

  return agents.map((agent, index) => {
    const angle = (index / agents.length) * Math.PI * 2;
    const x = Math.cos(angle) * dynamicRadius;
    const z = Math.sin(angle) * dynamicRadius;
    return {
      ...agent,
      position: [x, 0, z],
      rotationY: Math.atan2(x, z),
    };
  });
}

function statusBadge(
  status: OfficeDeskAgent["status"],
  risk: OfficeDeskAgent["risk"],
): { label: string; kind: "blocked" | "approval" | "active" | "ready" | "idle" } {
  if (risk === "blocked" || risk === "error") {
    return { label: "BLOCK", kind: "blocked" };
  }
  if (risk === "approval") {
    return { label: "HOLD", kind: "approval" };
  }
  if (status === "active") {
    return { label: "RUN", kind: "active" };
  }
  if (status === "ready") {
    return { label: "READY", kind: "ready" };
  }
  return { label: "IDLE", kind: "idle" };
}

function deskTone(
  status: OfficeDeskAgent["status"],
  risk: OfficeDeskAgent["risk"],
  selected: boolean,
  hovered: boolean,
): string {
  if (risk === "blocked" || risk === "error") {
    return selected ? "#6d4b49" : "#5b4644";
  }
  if (risk === "approval") {
    return selected ? "#6f6550" : "#615946";
  }
  if (status === "active") {
    return selected ? "#5f604f" : hovered ? "#585849" : "#505044";
  }
  if (status === "ready") {
    return selected ? "#616452" : "#545646";
  }
  return selected ? "#5d5750" : "#4f4b45";
}

function screenGlow(
  status: OfficeDeskAgent["status"],
  risk: OfficeDeskAgent["risk"],
): string {
  if (risk === "blocked" || risk === "error") {
    return "#8a2f2a";
  }
  if (risk === "approval") {
    return "#8b6f2d";
  }
  if (status === "active") {
    return "#2d6651";
  }
  if (status === "ready") {
    return "#55663a";
  }
  return "#47535a";
}

function goatCoatColor(
  status: OfficeDeskAgent["status"],
  risk: OfficeDeskAgent["risk"],
): string {
  if (risk === "blocked" || risk === "error") {
    return "#b36c66";
  }
  if (risk === "approval") {
    return "#bea46d";
  }
  if (status === "active") {
    return "#b8b3a4";
  }
  if (status === "ready") {
    return "#c6c2ad";
  }
  return "#a6a092";
}

function operatorPresetPalette(preset: OperatorPreset): {
  body: string;
  skin: string;
  accent: string;
} {
  if (preset === "nightwatch") {
    return { body: "#2f4f66", skin: "#e0c0a1", accent: "#4fb7d9" };
  }
  if (preset === "strategist") {
    return { body: "#495a3f", skin: "#e6c7a7", accent: "#8fce5f" };
  }
  return { body: "#70492f", skin: "#e4c3a2", accent: "#ffb36d" };
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
