import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useMemo, useRef, useState } from "react";
import type { Group, Mesh } from "three";
import { OFFICE_ZONE_ORDER, inferOfficeZone, officeZoneLabel, type OfficeZoneId } from "../data/office-zones";

// ---------------------------------------------------------------------------
// Public types (unchanged for backward compat with OfficePage)
// ---------------------------------------------------------------------------

export type OperatorPreset = "trailblazer" | "strategist" | "nightwatch";
export type OfficeMotionMode = "cinematic" | "balanced" | "subtle" | "reduced";
export type OfficeAttentionLevel = "stable" | "watch" | "priority";
export type OfficeActivityState =
  | "idle_milling"
  | "transitioning_to_desk"
  | "working_seated"
  | "collaborating"
  | "alert_response";
export type OfficeOperatorActivityState = "idle_patrol" | "command_center";
export type { OfficeZoneId } from "../data/office-zones";

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
  zoneId?: OfficeZoneId;
  zoneLabel?: string;
  attentionLevel?: OfficeAttentionLevel;
  behaviorDirective?: string;
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
  roomFloorTilePath?: string;
  roomWallPath?: string;
  roomWindowWallPath?: string;
  roomColumnPath?: string;
  roomLightPath?: string;
  deskModelPath?: string;
  commandDeskModelPath?: string;
  chairModelPath?: string;
  lockerModelPath?: string;
  shelfModelPath?: string;
  crateModelPath?: string;
  accessPointModelPath?: string;
  computerModelPath?: string;
  mugModelPath?: string;
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BG_COLOR = "#0a0e14";
const HOLO_CYAN = "#54ddff";
const ALERT_ORANGE = "#ff9a45";
const TABLE_RADIUS = 3.2;
const TABLE_HEIGHT = 0.12;
const TABLE_Y = 0.72;
const SEAT_RADIUS = 4.2;
const HOLO_DISC_RADIUS = 2.1;
const HOLO_DISC_Y = TABLE_Y + 0.6;

const ZONE_COLORS: Record<OfficeZoneId, string> = {
  command: "#f3b36a",
  build: "#57d6b3",
  research: "#8d88ff",
  security: "#ff7466",
  operations: "#5ec4ff",
};

// ---------------------------------------------------------------------------
// Layout: place agents in a circle around the table
// ---------------------------------------------------------------------------

interface SeatLayout extends OfficeDeskAgent {
  seatIndex: number;
  seatAngle: number;
  position: [number, number, number];
  rotationY: number;
  zoneId: OfficeZoneId;
  zoneLabel: string;
}

function buildCircularLayout(agents: OfficeDeskAgent[]): SeatLayout[] {
  if (agents.length === 0) {
    return [];
  }

  const grouped = new Map<OfficeZoneId, OfficeDeskAgent[]>();
  for (const zoneId of OFFICE_ZONE_ORDER) {
    grouped.set(zoneId, []);
  }
  for (const agent of agents) {
    const zoneId = inferOfficeZone(agent);
    grouped.get(zoneId)?.push(agent);
  }

  // Flatten into ordered list: grouped by zone, zones in canonical order
  const ordered: Array<{ agent: OfficeDeskAgent; zoneId: OfficeZoneId }> = [];
  for (const zoneId of OFFICE_ZONE_ORDER) {
    for (const agent of grouped.get(zoneId) ?? []) {
      ordered.push({ agent, zoneId });
    }
  }

  const total = ordered.length;
  // Reserve top position (angle 0 = +Z) for operator; agents start at offset
  const angleStep = (Math.PI * 2) / (total + 1);
  const startAngle = angleStep; // skip seat 0 (operator)

  return ordered.map(({ agent, zoneId }, index) => {
    const angle = startAngle + index * angleStep;
    const x = Math.sin(angle) * SEAT_RADIUS;
    const z = Math.cos(angle) * SEAT_RADIUS;
    // Face inward toward center
    const facingAngle = Math.atan2(-x, -z);
    return {
      ...agent,
      seatIndex: index,
      seatAngle: angle,
      position: [x, 0, z],
      rotationY: facingAngle,
      zoneId,
      zoneLabel: agent.zoneLabel ?? officeZoneLabel(zoneId),
    };
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const OfficeCanvas = memo(function OfficeCanvas(props: OfficeCanvasProps) {
  const layout = useMemo(() => buildCircularLayout(props.agents), [props.agents]);
  const reducedMotion = props.motionMode === "reduced";
  const motionScalar = motionScalarForMode(props.motionMode);

  const positionsByRoleId = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const seat of layout) {
      map.set(seat.roleId, seat.position);
    }
    return map;
  }, [layout]);

  return (
    <div className="office-webgl-stage office-webgl-stage-v5">
      <Canvas
        camera={{ position: [0, 9.5, 12], fov: 38 }}
        shadows
        dpr={[1, 1.55]}
        onPointerMissed={() => props.onSelect("operator")}
      >
        <color attach="background" args={[BG_COLOR]} />
        <fog attach="fog" args={[BG_COLOR, 18, 38]} />

        {/* Lighting */}
        <ambientLight intensity={0.25} color="#c8d8f0" />
        <hemisphereLight color="#4a6a8a" groundColor="#0a0e14" intensity={0.3} />
        <directionalLight
          position={[0, 12, 0]}
          intensity={1.2}
          color="#e8f0ff"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-camera-near={1}
          shadow-camera-far={20}
          shadow-bias={-0.0003}
        />
        <spotLight
          position={[0, 8, 0]}
          angle={0.5}
          penumbra={0.6}
          intensity={1.6}
          color="#d4e8ff"
          target-position={[0, 0, 0]}
          castShadow={false}
        />

        {/* Room */}
        <BridgeRoom />

        {/* Central table */}
        <CommandTable />

        {/* Holographic center display */}
        <HolographicDisplay reducedMotion={reducedMotion} motionScalar={motionScalar} />

        {/* Operator seat */}
        <OperatorSeat
          operator={props.operator}
          selected={props.selectedEntityId === "operator"}
          onSelect={props.onSelect}
          reducedMotion={reducedMotion}
          motionScalar={motionScalar}
        />

        {/* Agent seats */}
        {layout.map((seat) => (
          <AgentSeat
            key={seat.roleId}
            seat={seat}
            selected={props.selectedEntityId === seat.roleId}
            onSelect={props.onSelect}
            reducedMotion={reducedMotion}
            motionScalar={motionScalar}
          />
        ))}

        {/* Collaboration beams */}
        <CollaborationOverlay
          edges={props.collaborationEdges}
          positionsByRoleId={positionsByRoleId}
          visible={props.showCollabOverlay}
          reducedMotion={reducedMotion}
          motionScalar={motionScalar}
        />

        {/* Zone accent lights at each seat */}
        {layout.map((seat) => (
          <pointLight
            key={`zone-light-${seat.roleId}`}
            position={[seat.position[0], 1.2, seat.position[2]]}
            intensity={seat.status === "active" ? 0.4 : 0.15}
            color={ZONE_COLORS[seat.zoneId]}
            distance={3.5}
          />
        ))}

        <OrbitControls
          makeDefault
          target={[0, 1.0, 0]}
          maxPolarAngle={Math.PI / 2.1}
          minPolarAngle={Math.PI / 6}
          minDistance={7}
          maxDistance={24}
          enablePan={false}
        />
      </Canvas>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Room: dark environment with concentric floor rings
// ---------------------------------------------------------------------------

function BridgeRoom() {
  return (
    <group>
      {/* Base floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[12, 64]} />
        <meshStandardMaterial color="#0c1018" roughness={0.92} metalness={0.15} />
      </mesh>

      {/* Subtle grid overlay */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.02, 12, 64]} />
        <meshStandardMaterial color="#141a24" roughness={0.88} metalness={0.1} />
      </mesh>

      {/* Concentric radar-style floor rings */}
      {[2.0, 4.0, 6.0, 8.0, 10.0].map((radius) => (
        <mesh key={`floor-ring-${radius}`} position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - 0.02, radius + 0.02, 64]} />
          <meshStandardMaterial
            color={HOLO_CYAN}
            emissive={HOLO_CYAN}
            emissiveIntensity={radius <= 4 ? 0.35 : 0.15}
            transparent
            opacity={radius <= 4 ? 0.5 : 0.25}
          />
        </mesh>
      ))}

      {/* Cross-hair lines on floor */}
      {[0, Math.PI / 2].map((rot) => (
        <mesh key={`crosshair-${rot}`} position={[0, 0.006, 0]} rotation={[-Math.PI / 2, rot, 0]}>
          <planeGeometry args={[0.02, 24]} />
          <meshStandardMaterial
            color={HOLO_CYAN}
            emissive={HOLO_CYAN}
            emissiveIntensity={0.2}
            transparent
            opacity={0.2}
          />
        </mesh>
      ))}

      {/* Peripheral ambient panels (floating holo-panels for atmosphere) */}
      {[
        { pos: [-8, 2.4, -6] as [number, number, number], rot: 0.4 },
        { pos: [8, 2.4, -6] as [number, number, number], rot: -0.4 },
        { pos: [0, 2.8, -9] as [number, number, number], rot: 0 },
      ].map((panel, i) => (
        <mesh key={`ambient-panel-${i}`} position={panel.pos} rotation={[0, panel.rot, 0]}>
          <planeGeometry args={[2.8, 1.4]} />
          <meshStandardMaterial
            color="#0a1420"
            emissive={HOLO_CYAN}
            emissiveIntensity={0.12}
            transparent
            opacity={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Central round table
// ---------------------------------------------------------------------------

function CommandTable() {
  return (
    <group>
      {/* Table surface */}
      <mesh position={[0, TABLE_Y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, TABLE_HEIGHT, 48]} />
        <meshStandardMaterial color="#1a1e28" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* Emissive ring edge */}
      <mesh position={[0, TABLE_Y + TABLE_HEIGHT / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TABLE_RADIUS - 0.06, TABLE_RADIUS, 48]} />
        <meshStandardMaterial
          color={HOLO_CYAN}
          emissive={HOLO_CYAN}
          emissiveIntensity={0.6}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Inner accent ring */}
      <mesh position={[0, TABLE_Y + TABLE_HEIGHT / 2 + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[HOLO_DISC_RADIUS - 0.04, HOLO_DISC_RADIUS + 0.04, 48]} />
        <meshStandardMaterial
          color={HOLO_CYAN}
          emissive={HOLO_CYAN}
          emissiveIntensity={0.3}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Table pedestal */}
      <mesh position={[0, TABLE_Y / 2, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, TABLE_Y, 24]} />
        <meshStandardMaterial color="#12161e" roughness={0.7} metalness={0.35} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Holographic center display
// ---------------------------------------------------------------------------

function HolographicDisplay(props: { reducedMotion: boolean; motionScalar: number }) {
  const discRef = useRef<Mesh>(null);
  const particlesRef = useRef<Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (discRef.current) {
      const speed = props.reducedMotion ? 0.1 : 0.25 * props.motionScalar;
      discRef.current.rotation.y = t * speed;
    }
    if (particlesRef.current && !props.reducedMotion) {
      particlesRef.current.rotation.y = -t * 0.15 * props.motionScalar;
      particlesRef.current.position.y = HOLO_DISC_Y + Math.sin(t * 0.8) * 0.06 * props.motionScalar;
    }
  });

  return (
    <group>
      {/* Holographic disc */}
      <mesh ref={discRef} position={[0, HOLO_DISC_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, HOLO_DISC_RADIUS, 48]} />
        <meshStandardMaterial
          color={HOLO_CYAN}
          emissive={HOLO_CYAN}
          emissiveIntensity={0.4}
          transparent
          opacity={0.18}
          side={2}
        />
      </mesh>

      {/* Upper disc (subtle) */}
      <mesh position={[0, HOLO_DISC_Y + 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 1.2, 36]} />
        <meshStandardMaterial
          color={HOLO_CYAN}
          emissive={HOLO_CYAN}
          emissiveIntensity={0.25}
          transparent
          opacity={0.1}
          side={2}
        />
      </mesh>

      {/* Particle ring (6 orbs) */}
      <group ref={particlesRef} position={[0, HOLO_DISC_Y, 0]}>
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i / 6) * Math.PI * 2;
          const r = 1.3;
          const y = (i % 2) * 0.2;
          return (
            <mesh
              key={`particle-${i}`}
              position={[Math.sin(angle) * r, y, Math.cos(angle) * r]}
            >
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshStandardMaterial
                color={HOLO_CYAN}
                emissive={HOLO_CYAN}
                emissiveIntensity={0.8}
              />
            </mesh>
          );
        })}
      </group>

      {/* Central glow light */}
      <pointLight
        position={[0, HOLO_DISC_Y + 0.3, 0]}
        intensity={0.6}
        color={HOLO_CYAN}
        distance={6}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Operator seat (head of table, slightly elevated)
// ---------------------------------------------------------------------------

function OperatorSeat(props: {
  operator: OfficeOperatorModel;
  selected: boolean;
  onSelect: (entityId: string) => void;
  reducedMotion: boolean;
  motionScalar: number;
}) {
  const [hovered, setHovered] = useState(false);
  const glowRef = useRef<Mesh>(null);
  const preset = operatorPresetPalette(props.operator.preset);

  // Operator sits at angle 0 (top of circle, +Z direction)
  const seatX = 0;
  const seatZ = SEAT_RADIUS;
  const elevation = 0.08; // slightly raised

  useFrame((state) => {
    if (!glowRef.current) {
      return;
    }
    const t = state.clock.elapsedTime;
    const pulse = props.reducedMotion ? 0.02 : 0.06 * props.motionScalar;
    glowRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * pulse);
  });

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    props.onSelect("operator");
  };

  return (
    <group
      position={[seatX, elevation, seatZ]}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Chair base */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.6, 0.7]} />
        <meshStandardMaterial color="#1c2230" roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Chair back (taller = command chair) */}
      <mesh position={[0, 0.8, 0.32]} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.08]} />
        <meshStandardMaterial color="#1a1e2a" roughness={0.65} metalness={0.3} />
      </mesh>
      {/* Armrests */}
      {[-0.38, 0.38].map((x) => (
        <mesh key={`arm-${x}`} position={[x, 0.55, 0.1]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0.5]} />
          <meshStandardMaterial color="#242a38" roughness={0.7} metalness={0.25} />
        </mesh>
      ))}

      {/* Operator avatar indicator */}
      <mesh ref={glowRef} position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial
          color={preset.accent}
          emissive={preset.accent}
          emissiveIntensity={props.selected ? 0.8 : 0.5}
        />
      </mesh>

      {/* Selection ring */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.52, 0.62, 32]} />
        <meshStandardMaterial
          color={props.selected ? "#ffddaf" : "#2a2e3a"}
          emissive={props.selected ? "#ffca87" : "#1a1e26"}
          emissiveIntensity={props.selected ? 0.4 : 0.05}
          side={2}
        />
      </mesh>

      {/* Overhead status hologram */}
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial
          color={preset.accent}
          emissive={preset.accent}
          emissiveIntensity={0.7}
          transparent
          opacity={0.6}
        />
      </mesh>

      <pointLight position={[0, 1.2, 0]} intensity={0.4} color={preset.accent} distance={3} />

      {/* Label */}
      {(props.selected || hovered) ? (
        <Html position={[0, 2.0, 0]} center distanceFactor={12} transform={false} occlude={false}>
          <div className={`office-thought-html ${props.selected ? "selected" : ""}`}>
            <p className="name">{props.operator.name}</p>
            <p className="meta">Operator | Command Bridge</p>
            <div className="office-thought-flags">
              <span className="office-thought-chip office-thought-chip-command">Operator</span>
              <span className="office-thought-chip office-thought-chip-active">
                {props.operator.activityState === "command_center" ? "Command" : "Patrol"}
              </span>
            </div>
            <p className="thought">{truncate(props.operator.currentThought, 120)}</p>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Agent seat
// ---------------------------------------------------------------------------

function AgentSeat(props: {
  seat: SeatLayout;
  selected: boolean;
  onSelect: (entityId: string) => void;
  reducedMotion: boolean;
  motionScalar: number;
}) {
  const [hovered, setHovered] = useState(false);
  const glowRef = useRef<Mesh>(null);
  const { seat } = props;
  const zoneColor = ZONE_COLORS[seat.zoneId];
  const isActive = seat.status === "active";
  const isAlert = seat.activityState === "alert_response";
  const isBlocked = seat.risk === "blocked" || seat.risk === "error";

  useFrame((state) => {
    if (!glowRef.current) {
      return;
    }
    const t = state.clock.elapsedTime + seat.seatIndex * 0.7;
    const amp = props.reducedMotion ? 0.01 : (isAlert ? 0.1 : 0.04) * props.motionScalar;
    glowRef.current.scale.setScalar(1 + Math.sin(t * (isAlert ? 4 : 1.8)) * amp);

    if (isAlert && !props.reducedMotion) {
      const flash = Math.sin(t * 6) > 0 ? 0.9 : 0.4;
      (glowRef.current.material as { emissiveIntensity?: number }).emissiveIntensity = flash;
    }
  });

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    props.onSelect(seat.roleId);
  };

  const avatarColor = isBlocked ? "#ff7466" : isAlert ? ALERT_ORANGE : isActive ? zoneColor : "#4a5568";
  const avatarEmissive = isBlocked || isAlert ? 0.7 : isActive ? 0.5 : 0.2;

  return (
    <group
      position={seat.position}
      rotation={[0, seat.rotationY, 0]}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Chair */}
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.5, 0.55]} />
        <meshStandardMaterial color="#161a24" roughness={0.75} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.6, 0.25]} castShadow>
        <boxGeometry args={[0.55, 0.5, 0.06]} />
        <meshStandardMaterial color="#141822" roughness={0.7} metalness={0.25} />
      </mesh>

      {/* Zone accent strip on chair */}
      <mesh position={[0, 0.48, -0.28]}>
        <boxGeometry args={[0.5, 0.03, 0.02]} />
        <meshStandardMaterial color={zoneColor} emissive={zoneColor} emissiveIntensity={0.5} />
      </mesh>

      {/* Agent avatar (sphere) */}
      <mesh ref={glowRef} position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.14, 14, 14]} />
        <meshStandardMaterial
          color={avatarColor}
          emissive={avatarColor}
          emissiveIntensity={avatarEmissive}
        />
      </mesh>

      {/* Status hologram above seat */}
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial
          color={statusHoloColor(seat.status, seat.risk)}
          emissive={statusHoloColor(seat.status, seat.risk)}
          emissiveIntensity={0.7}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Selection ring */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.5, 28]} />
        <meshStandardMaterial
          color={props.selected ? "#ffddaf" : "#1e222e"}
          emissive={props.selected ? "#ffca87" : "#12161e"}
          emissiveIntensity={props.selected ? 0.4 : 0.04}
          side={2}
        />
      </mesh>

      {/* Status badge */}
      {(props.selected || hovered || isActive || seat.attentionLevel !== "stable") ? (
        <Html position={[0, 1.48, 0]} center distanceFactor={11} transform={false} occlude={false}>
          <div className={`office-status-chip office-status-${statusBadge(seat.status, seat.risk, seat.activityState).kind}`}>
            {statusBadge(seat.status, seat.risk, seat.activityState).label}
          </div>
        </Html>
      ) : null}

      {/* Thought overlay */}
      {(props.selected || isActive || hovered) ? (
        <Html position={[0, 1.8, 0]} center distanceFactor={11} transform={false} occlude={false}>
          <div className={`office-thought-html ${props.selected ? "selected" : ""}`}>
            <p className="name">{seat.name}</p>
            <p className="meta">{seat.title} | {seat.zoneLabel}</p>
            <div className="office-thought-flags">
              <span className={`office-thought-chip office-thought-chip-${seat.zoneId}`}>
                {seat.zoneLabel}
              </span>
              <span className={`office-thought-chip office-thought-chip-${activityChipKind(seat.activityState, seat.risk)}`}>
                {activityLabel(seat.activityState)}
              </span>
              <span className={`office-thought-chip office-thought-chip-${attentionChipKind(seat.attentionLevel)}`}>
                {attentionLabel(seat.attentionLevel)}
              </span>
            </div>
            <p className="thought">{truncate(seat.currentThought, 100)}</p>
            {seat.behaviorDirective ? (
              <p className="office-thought-directive">{truncate(seat.behaviorDirective, 96)}</p>
            ) : null}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Collaboration overlay
// ---------------------------------------------------------------------------

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
  const pulseRef = useRef<Group>(null);

  const fromX = props.start[0];
  const fromZ = props.start[2];
  const toX = props.end[0];
  const toZ = props.end[2];
  const beamY = TABLE_Y + 0.2;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
  const yaw = Math.atan2(dx, dz);
  const midX = (fromX + toX) / 2;
  const midZ = (fromZ + toZ) / 2;

  const beamColor = props.risk ? "#d86458" : HOLO_CYAN;
  const beamScale = 0.03 + Math.min(0.02, props.strength * 0.01);

  useFrame((state) => {
    if (!pulseRef.current || props.reducedMotion) {
      return;
    }
    const t = state.clock.elapsedTime * (0.8 + props.motionScalar * 0.6);
    const p = ((t + props.offset) % 1 + 1) % 1;
    pulseRef.current.position.set(
      lerp(fromX, toX, p),
      beamY,
      lerp(fromZ, toZ, p),
    );
  });

  return (
    <group>
      <group position={[midX, beamY, midZ]} rotation={[0, yaw, 0]}>
        <mesh>
          <boxGeometry args={[beamScale, beamScale, distance]} />
          <meshStandardMaterial
            color={beamColor}
            emissive={beamColor}
            emissiveIntensity={0.35}
            transparent
            opacity={0.6}
          />
        </mesh>
      </group>

      {!props.reducedMotion ? (
        <group ref={pulseRef} position={[fromX, beamY, fromZ]}>
          <mesh>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={beamColor} emissive={beamColor} emissiveIntensity={0.7} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Helper functions (kept for backward compat with CSS classes)
// ---------------------------------------------------------------------------

function statusHoloColor(status: OfficeDeskAgent["status"], risk: OfficeDeskAgent["risk"]): string {
  if (risk === "blocked" || risk === "error") {
    return "#ff7466";
  }
  if (risk === "approval") {
    return ALERT_ORANGE;
  }
  if (status === "active") {
    return "#54ddff";
  }
  if (status === "ready") {
    return "#8fce5f";
  }
  return "#4a5568";
}

function statusBadge(
  status: OfficeDeskAgent["status"],
  risk: OfficeDeskAgent["risk"],
  activityState: OfficeActivityState,
): { label: string; kind: "blocked" | "approval" | "active" | "ready" | "idle" } {
  if (activityState === "alert_response") {
    return { label: "ALERT", kind: "blocked" };
  }
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

function activityLabel(activityState: OfficeActivityState): string {
  if (activityState === "idle_milling") {
    return "Patrol";
  }
  if (activityState === "transitioning_to_desk") {
    return "Routing";
  }
  if (activityState === "working_seated") {
    return "Execute";
  }
  if (activityState === "collaborating") {
    return "Sync";
  }
  return "Alert";
}

function attentionLabel(attentionLevel: OfficeAttentionLevel | undefined): string {
  if (attentionLevel === "priority") {
    return "Priority";
  }
  if (attentionLevel === "watch") {
    return "Watch";
  }
  return "Stable";
}

function attentionChipKind(
  attentionLevel: OfficeAttentionLevel | undefined,
): "active" | "approval" | "blocked" {
  if (attentionLevel === "priority") {
    return "blocked";
  }
  if (attentionLevel === "watch") {
    return "approval";
  }
  return "active";
}

function activityChipKind(
  activityState: OfficeActivityState,
  risk: OfficeDeskAgent["risk"],
): "active" | "idle" | "approval" | "blocked" {
  if (activityState === "alert_response" || risk === "blocked" || risk === "error") {
    return "blocked";
  }
  if (risk === "approval") {
    return "approval";
  }
  if (activityState === "idle_milling") {
    return "idle";
  }
  return "active";
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
