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
const MAX_ANIMATED_AGENTS = 12;

export type OperatorPreset = "trailblazer" | "strategist" | "nightwatch";
export type OfficeMotionMode = "cinematic" | "balanced" | "subtle" | "reduced";
export type OfficeActivityState = "idle_milling" | "transitioning_to_desk" | "working_seated" | "collaborating";
export type OfficeOperatorActivityState = "idle_patrol" | "command_center";

export interface OfficeOperatorModel {
  operatorId: string;
  name: string;
  preset: OperatorPreset;
  currentThought: string;
  activityState: OfficeOperatorActivityState;
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
  activityState: OfficeActivityState;
  collabPeers: string[];
}

export interface OfficeCollaborationEdge {
  fromRoleId: string;
  toRoleId: string;
  strength: number;
  risk: boolean;
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
  motionMode: OfficeMotionMode;
  showCollabOverlay: boolean;
  idleMillingEnabled: boolean;
  collaborationEdges: OfficeCollaborationEdge[];
}

interface DeskAgentLayout extends OfficeDeskAgent {
  position: [number, number, number];
  rotationY: number;
}

export const OfficeCanvas = memo(function OfficeCanvas(props: OfficeCanvasProps) {
  const layout = useMemo(() => buildRadialLayout(props.agents), [props.agents]);
  const reducedMotion = props.motionMode === "reduced";
  const motionScalar = motionScalarForMode(props.motionMode);
  const positionsByRoleId = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const agent of layout) {
      map.set(agent.roleId, agent.position);
    }
    return map;
  }, [layout]);

  return (
    <div className="office-webgl-stage office-webgl-stage-v5">
      <Canvas
        camera={{ position: [0, 7.1, 11.8], fov: 42 }}
        shadows
        dpr={[1, 1.8]}
        onPointerMissed={() => props.onSelect("operator")}
      >
        <color attach="background" args={["#1f1f1d"]} />
        <fog attach="fog" args={["#1f1f1d", 16, 34]} />

        <ambientLight intensity={0.47} color="#f4f1eb" />
        <hemisphereLight color="#f7f5ef" groundColor="#5f5950" intensity={0.32} />
        <directionalLight
          position={[7, 11, 6]}
          intensity={0.92}
          color="#fffdf8"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-8, 5, -7]} intensity={0.31} color="#d6d0c8" />

        <OfficeRoom />
        <OfficeFurniture />

        <OperatorStation
          operator={props.operator}
          selected={props.selectedEntityId === "operator"}
          onSelect={props.onSelect}
          modelPath={props.assetPack?.operatorModelPath}
          reducedMotion={reducedMotion}
          motionScalar={motionScalar}
        />

        {layout.map((agent, index) => (
          <AgentStation
            key={agent.roleId}
            agent={agent}
            selected={props.selectedEntityId === agent.roleId}
            onSelect={props.onSelect}
            phaseOffset={index * 0.61}
            goatModelPath={props.assetPack?.goatModelPath}
            reducedMotion={reducedMotion}
            motionScalar={motionScalar}
            idleMillingEnabled={props.idleMillingEnabled}
            lowFidelity={index >= MAX_ANIMATED_AGENTS}
          />
        ))}

        <CollaborationOverlay
          edges={props.collaborationEdges}
          positionsByRoleId={positionsByRoleId}
          visible={props.showCollabOverlay}
          reducedMotion={reducedMotion}
          motionScalar={motionScalar}
        />

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

function OfficeFurniture() {
  return (
    <group>
      <WallBoard position={[0, 1.9, -8.85]} />
      <CabinetRow position={[-8.2, 0, -1.6]} />
      <CabinetRow position={[8.2, 0, -1.6]} mirrored />
      <ConferenceZone position={[0, 0, 7.1]} />
      <PlantCluster />
      <CeilingLamps />
    </group>
  );
}

function WallBoard(props: { position: [number, number, number] }) {
  return (
    <group position={props.position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[4.8, 1.8, 0.1]} />
        <meshStandardMaterial color="#d2cbc0" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[4.2, 1.35]} />
        <meshStandardMaterial color="#f1ebdf" roughness={0.9} emissive="#f1ebdf" emissiveIntensity={0.06} />
      </mesh>
    </group>
  );
}

function CabinetRow(props: { position: [number, number, number]; mirrored?: boolean }) {
  return (
    <group position={props.position} rotation={[0, props.mirrored ? -Math.PI / 2 : Math.PI / 2, 0]}>
      {[-1.2, 0, 1.2].map((offset) => (
        <mesh key={offset} position={[offset, 0.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.05, 0.9, 0.6]} />
          <meshStandardMaterial color="#5d574f" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

function ConferenceZone(props: { position: [number, number, number] }) {
  return (
    <group position={props.position}>
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.25, 1.3, 0.11, 24]} />
        <meshStandardMaterial color="#5f594f" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.24, 0.38, 14]} />
        <meshStandardMaterial color="#4b4640" roughness={0.78} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * 1.65, 0.33, Math.sin(angle) * 1.65]}
          rotation={[0, angle, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.58, 0.46, 0.58]} />
          <meshStandardMaterial color="#4b4943" roughness={0.88} />
        </mesh>
      ))}
    </group>
  );
}

function PlantCluster() {
  return (
    <group>
      {[
        [-7.5, 0.42, 7.4] as [number, number, number],
        [7.5, 0.42, 7.4] as [number, number, number],
      ].map((pos, index) => (
        <group key={index} position={pos}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.18, 0.2, 0.22, 16]} />
            <meshStandardMaterial color="#6f5242" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.34, 0]} castShadow>
            <sphereGeometry args={[0.3, 14, 14]} />
            <meshStandardMaterial color="#6b8860" roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CeilingLamps() {
  return (
    <group>
      {[-4.2, 0, 4.2].map((x) => (
        <group key={x} position={[x, 2.7, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.6, 0.06, 0.7]} />
            <meshStandardMaterial color="#cbc5b8" emissive="#cbc5b8" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function OperatorStation(props: {
  operator: OfficeOperatorModel;
  selected: boolean;
  onSelect: (entityId: string) => void;
  modelPath?: string;
  reducedMotion: boolean;
  motionScalar: number;
}) {
  const avatarRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const preset = operatorPresetPalette(props.operator.preset);
  const positionRef = useRef({ x: 0, y: 0.87, z: 0.12 });

  useFrame((state) => {
    if (!avatarRef.current) {
      return;
    }

    const t = state.clock.elapsedTime;
    const patrolEnabled = props.operator.activityState === "idle_patrol" && !props.reducedMotion;
    const patrolRadius = patrolEnabled ? 0.58 : 0;
    const targetX = patrolEnabled ? Math.cos(t * 0.38) * patrolRadius : 0;
    const targetZ = patrolEnabled ? Math.sin(t * 0.42) * patrolRadius * 0.75 + 0.12 : 0.12;
    const targetY = 0.87 + (props.reducedMotion ? 0.01 : 0.035 * props.motionScalar) * Math.sin(t * 1.15);

    const smooth = props.reducedMotion ? 0.22 : 0.12;
    positionRef.current.x += (targetX - positionRef.current.x) * smooth;
    positionRef.current.y += (targetY - positionRef.current.y) * smooth;
    positionRef.current.z += (targetZ - positionRef.current.z) * smooth;

    avatarRef.current.position.set(positionRef.current.x, positionRef.current.y, positionRef.current.z);

    const pulseBase = props.selected ? 1.04 : 1;
    const pulse = props.reducedMotion ? 0.0025 : 0.008 * props.motionScalar;
    avatarRef.current.scale.setScalar(pulseBase + Math.sin(t * 2.2) * pulse);
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
        <meshStandardMaterial color="#3f3f3d" emissive={preset.accent} emissiveIntensity={0.2} />
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
  reducedMotion: boolean;
  motionScalar: number;
  idleMillingEnabled: boolean;
  lowFidelity: boolean;
}) {
  const avatarRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [x, y, z] = props.agent.position;
  const localPosRef = useRef({ x: 0, y: 0.9, z: 0.18 });

  useFrame((state) => {
    if (!avatarRef.current) {
      return;
    }

    const t = state.clock.elapsedTime + props.phaseOffset;
    const seatTarget = { x: 0, y: 0.78, z: 0.16 };
    const target = { ...seatTarget };
    const reduced = props.reducedMotion || props.lowFidelity;

    if (props.agent.activityState === "idle_milling" && props.idleMillingEnabled && !reduced) {
      target.x = Math.cos(t * 0.62) * 0.34;
      target.z = Math.sin(t * 0.95) * 0.26 + 0.1;
      target.y = 0.82 + Math.sin(t * 1.45) * 0.03 * props.motionScalar;
    } else if (props.agent.activityState === "transitioning_to_desk" && !reduced) {
      const blend = Math.min(1, (Math.sin(t * 1.15) + 1) * 0.5);
      target.x = Math.cos(t * 0.8) * 0.12 * (1 - blend);
      target.z = 0.16 + Math.sin(t * 0.8) * 0.08 * (1 - blend);
      target.y = 0.79 + Math.sin(t * 1.8) * 0.02 * props.motionScalar;
    } else {
      target.y = 0.79 + Math.sin(t * 2.4) * (reduced ? 0.008 : 0.02 * props.motionScalar);
      if (props.agent.activityState === "collaborating" && !reduced) {
        target.z = 0.16 + Math.sin(t * 5.8) * 0.02;
      }
    }

    const smooth = reduced ? 0.2 : 0.1;
    localPosRef.current.x += (target.x - localPosRef.current.x) * smooth;
    localPosRef.current.y += (target.y - localPosRef.current.y) * smooth;
    localPosRef.current.z += (target.z - localPosRef.current.z) * smooth;

    avatarRef.current.position.set(localPosRef.current.x, localPosRef.current.y, localPosRef.current.z);

    if (props.agent.activityState === "idle_milling" && props.idleMillingEnabled && !reduced) {
      const heading = Math.atan2(Math.cos(t * 0.95), -Math.sin(t * 0.62));
      avatarRef.current.rotation.y += (heading - avatarRef.current.rotation.y) * 0.14;
    } else {
      avatarRef.current.rotation.y += (Math.PI - avatarRef.current.rotation.y) * 0.18;
    }

    const pulseBase = props.selected ? 1.03 : 1;
    const activePulse = props.agent.activityState === "working_seated" || props.agent.activityState === "collaborating";
    const pulseAmp = reduced ? 0.003 : activePulse ? 0.01 * props.motionScalar : 0.005 * props.motionScalar;
    avatarRef.current.scale.setScalar(pulseBase + Math.sin(t * 2.25) * pulseAmp);
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

      <DeskKit
        status={props.agent.status}
        risk={props.agent.risk}
        selected={props.selected}
        hovered={hovered}
        activityState={props.agent.activityState}
      />

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

function CollaborationOverlay(props: {
  edges: OfficeCollaborationEdge[];
  positionsByRoleId: Map<string, [number, number, number]>;
  visible: boolean;
  reducedMotion: boolean;
  motionScalar: number;
}) {
  if (!props.visible || props.edges.length === 0) {
    return null;
  }

  return (
    <group>
      {props.edges.map((edge, index) => {
        const start = props.positionsByRoleId.get(edge.fromRoleId);
        const end = props.positionsByRoleId.get(edge.toRoleId);
        if (!start || !end) {
          return null;
        }
        return (
          <CollaborationBeam
            key={`${edge.fromRoleId}->${edge.toRoleId}:${index}`}
            start={start}
            end={end}
            strength={edge.strength}
            risk={edge.risk}
            reducedMotion={props.reducedMotion}
            motionScalar={props.motionScalar}
            offset={index * 0.17}
          />
        );
      })}
    </group>
  );
}

function CollaborationBeam(props: {
  start: [number, number, number];
  end: [number, number, number];
  strength: number;
  risk: boolean;
  reducedMotion: boolean;
  motionScalar: number;
  offset: number;
}) {
  const pulseARef = useRef<Group>(null);
  const pulseBRef = useRef<Group>(null);

  const fromX = props.start[0];
  const fromZ = props.start[2];
  const toX = props.end[0];
  const toZ = props.end[2];
  const beamY = 0.58;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
  const yaw = Math.atan2(dx, dz);
  const midX = (fromX + toX) / 2;
  const midZ = (fromZ + toZ) / 2;

  const beamColor = props.risk ? "#d86458" : "#67d7c3";
  const beamOpacity = props.risk ? 0.68 : 0.62;
  const beamScale = 0.04 + Math.min(0.025, props.strength * 0.012);

  useFrame((state) => {
    if (!pulseARef.current || !pulseBRef.current || props.reducedMotion) {
      return;
    }
    const t = state.clock.elapsedTime * (0.8 + props.motionScalar * 0.8);
    const p1 = ((t + props.offset) % 1 + 1) % 1;
    const p2 = ((t + props.offset + 0.45) % 1 + 1) % 1;
    pulseARef.current.position.set(lerp(fromX, toX, p1), beamY, lerp(fromZ, toZ, p1));
    pulseBRef.current.position.set(lerp(fromX, toX, p2), beamY, lerp(fromZ, toZ, p2));
  });

  return (
    <group>
      <group position={[midX, beamY, midZ]} rotation={[0, yaw, 0]}>
        <mesh>
          <boxGeometry args={[beamScale, beamScale, distance]} />
          <meshStandardMaterial
            color={beamColor}
            emissive={beamColor}
            emissiveIntensity={props.reducedMotion ? 0.15 : 0.32}
            transparent
            opacity={beamOpacity}
          />
        </mesh>
      </group>

      {!props.reducedMotion ? (
        <>
          <group ref={pulseARef} position={[fromX, beamY, fromZ]}>
            <mesh>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshStandardMaterial color={beamColor} emissive={beamColor} emissiveIntensity={0.65} />
            </mesh>
          </group>
          <group ref={pulseBRef} position={[fromX, beamY, fromZ]}>
            <mesh>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshStandardMaterial color={beamColor} emissive={beamColor} emissiveIntensity={0.52} />
            </mesh>
          </group>
        </>
      ) : null}
    </group>
  );
}

function DeskKit(props: {
  status: OfficeDeskAgent["status"];
  risk: OfficeDeskAgent["risk"];
  selected: boolean;
  hovered: boolean;
  activityState: OfficeActivityState;
}) {
  const deskColor = deskTone(props.status, props.risk, props.selected, props.hovered);
  const screenColor = screenGlow(props.status, props.risk);
  const activeGlow = props.activityState === "collaborating" ? 0.66 : props.activityState === "working_seated" ? 0.52 : 0.42;

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
        <meshStandardMaterial color="#0e1518" emissive={screenColor} emissiveIntensity={activeGlow} />
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
  return <Clone object={gltf.scene} scale={props.scale} rotation={[0, props.rotationY ?? 0, 0]} />;
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

function motionScalarForMode(mode: OfficeMotionMode): number {
  if (mode === "cinematic") {
    return 1;
  }
  if (mode === "balanced") {
    return 0.72;
  }
  if (mode === "subtle") {
    return 0.45;
  }
  return 0.2;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
