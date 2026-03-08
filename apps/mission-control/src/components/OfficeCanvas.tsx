import { Clone, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimationMixer, LoopRepeat, Object3D, type AnimationClip, type Group, type InstancedMesh as ThreeInstancedMesh } from "three";
import { OFFICE_ZONE_ORDER, inferOfficeZone, officeZoneLabel, type OfficeZoneId } from "../data/office-zones";

// All scene dimensions are in meters to enforce consistent scale.
const METER = 1;
const FLOOR_SIZE = 18 * METER;
const WALL_HEIGHT = 3.2 * METER;
// All desks keep the animated goat path when available; overflow desks only calm secondary motion.
const MAX_FULL_MOTION_AGENTS = 12;
const MAX_FULL_DETAIL_AGENTS = 8;
const SERVER_WALL_Z = -8.15 * METER;
const WINDOW_BAND_HEIGHT = 1.42 * METER;

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

interface DeskAgentLayout extends OfficeDeskAgent {
  position: [number, number, number];
  rotationY: number;
  zoneId: OfficeZoneId;
  zoneLabel: string;
}

const OFFICE_ZONE_CONFIG: Record<OfficeZoneId, {
  anchor: [number, number, number];
  axis: "x" | "z";
  facing: number;
  accent: string;
  deckSize: [number, number];
}> = {
  command: {
    anchor: [-6.05, 0, 5.1],
    axis: "x",
    facing: Math.PI * 0.11,
    accent: "#f3b36a",
    deckSize: [6.35, 4.25],
  },
  build: {
    anchor: [6.05, 0, 5.1],
    axis: "x",
    facing: -Math.PI * 0.11,
    accent: "#57d6b3",
    deckSize: [6.35, 4.25],
  },
  research: {
    anchor: [-6.65, 0, -2.2],
    axis: "z",
    facing: Math.PI * 0.34,
    accent: "#8d88ff",
    deckSize: [4.9, 6.05],
  },
  security: {
    anchor: [6.65, 0, -2.2],
    axis: "z",
    facing: -Math.PI * 0.34,
    accent: "#ff7466",
    deckSize: [4.9, 6.05],
  },
  operations: {
    anchor: [0, 0, -6.25],
    axis: "x",
    facing: Math.PI,
    accent: "#5ec4ff",
    deckSize: [8.1, 4.15],
  },
};

export const OfficeCanvas = memo(function OfficeCanvas(props: OfficeCanvasProps) {
  const layout = useMemo(() => buildZonedLayout(props.agents), [props.agents]);
  const reducedMotion = props.motionMode === "reduced";
  const motionScalar = motionScalarForMode(props.motionMode);
  const denseHerd = layout.length >= 10;
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
        camera={{ position: [0, 8.25, 14.8], fov: 37 }}
        shadows
        dpr={[1, 1.55]}
        onPointerMissed={() => props.onSelect("operator")}
      >
        <color attach="background" args={["#161b23"]} />
        <fog attach="fog" args={["#161b23", 16, 34]} />

        <ambientLight intensity={0.64} color="#f4f1eb" />
        <hemisphereLight color="#f7f5ef" groundColor="#435061" intensity={0.42} />
        <directionalLight
          position={[6.8, 11.6, 6.5]}
          intensity={1.04}
          color="#fffdf8"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-11}
          shadow-camera-right={11}
          shadow-camera-top={11}
          shadow-camera-bottom={-11}
          shadow-camera-near={1}
          shadow-camera-far={28}
          shadow-bias={-0.00025}
        />
        <directionalLight position={[-8, 5, -7]} intensity={0.34} color="#d6d0c8" />
        <pointLight position={[-6.8, 2.4, -5.3]} intensity={0.18} color="#9187ff" distance={6.8} />
        <pointLight position={[6.8, 2.4, -5.3]} intensity={0.18} color="#ff8f7a" distance={6.8} />

        <OfficeRoom assetPack={props.assetPack} />
        <OfficeZoneDecks />
        <OfficeFurniture assetPack={props.assetPack} />

        <OperatorStation
          operator={props.operator}
          selected={props.selectedEntityId === "operator"}
          onSelect={props.onSelect}
          modelPath={props.assetPack?.operatorModelPath}
          deskModelPath={props.assetPack?.commandDeskModelPath}
          accessPointModelPath={props.assetPack?.accessPointModelPath}
          computerModelPath={props.assetPack?.computerModelPath}
          reducedMotion={reducedMotion}
          motionScalar={motionScalar}
        />

        {layout.length === 0 ? (
          <ZonePreviewStations assetPack={props.assetPack} />
        ) : null}

        {layout.map((agent, index) => (
          <AgentStation
            key={agent.roleId}
            agent={agent}
            selected={props.selectedEntityId === agent.roleId}
            onSelect={props.onSelect}
            phaseOffset={index * 0.61}
            goatModelPath={props.assetPack?.goatModelPath}
            assetPack={props.assetPack}
            reducedMotion={reducedMotion}
            motionScalar={motionScalar}
            idleMillingEnabled={props.idleMillingEnabled}
            reducedSecondaryMotion={index >= MAX_FULL_MOTION_AGENTS}
            compactDetail={denseHerd && index >= MAX_FULL_DETAIL_AGENTS}
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
          target={[0, 1.16, 0.25]}
          maxPolarAngle={Math.PI / 2.12}
          minPolarAngle={Math.PI / 5.6}
          minDistance={8.5}
          maxDistance={22}
          enablePan={false}
        />
      </Canvas>
    </div>
  );
});

function OfficeRoom(props: { assetPack?: OfficeAssetPack }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color={props.assetPack?.roomFloorTilePath ? "#10161d" : "#18212c"} roughness={0.9} metalness={0.1} />
      </mesh>

      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE - 2.4, FLOOR_SIZE - 2.4]} />
        <meshStandardMaterial color={props.assetPack?.roomFloorTilePath ? "#141d27" : "#202838"} roughness={0.76} metalness={0.18} />
      </mesh>

      {props.assetPack?.roomFloorTilePath ? (
        <RuntimeFloorGrid path={props.assetPack.roomFloorTilePath} />
      ) : null}

      <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[2.2, 3.4, 48]} />
        <meshStandardMaterial color="#172131" emissive="#3d759e" emissiveIntensity={0.24} side={2} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT / 2, -FLOOR_SIZE / 2]} receiveShadow>
        <boxGeometry args={[FLOOR_SIZE, WALL_HEIGHT, 0.2]} />
        <meshStandardMaterial color="#2a3444" roughness={0.84} metalness={0.2} />
      </mesh>

      <mesh position={[-FLOOR_SIZE / 2, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[0.2, WALL_HEIGHT, FLOOR_SIZE]} />
        <meshStandardMaterial color="#242d3d" roughness={0.86} metalness={0.16} />
      </mesh>

      <mesh position={[FLOOR_SIZE / 2, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[0.2, WALL_HEIGHT, FLOOR_SIZE]} />
        <meshStandardMaterial color="#242d3d" roughness={0.86} metalness={0.16} />
      </mesh>

      <mesh position={[0, 2.35, -8.86]} receiveShadow>
        <boxGeometry args={[13.6, WINDOW_BAND_HEIGHT, 0.08]} />
        <meshStandardMaterial color="#101824" emissive="#4a7197" emissiveIntensity={0.24} metalness={0.34} />
      </mesh>

      {props.assetPack?.roomWallPath ? (
        <RuntimeWallCladding wallPath={props.assetPack.roomWallPath} windowWallPath={props.assetPack.roomWindowWallPath} />
      ) : null}

      {props.assetPack?.roomColumnPath ? (
        <RuntimeColumns path={props.assetPack.roomColumnPath} />
      ) : (
        [-8.76, 8.76].map((x) => (
          <mesh key={`side-column-${x}`} position={[x, 1.56, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.34, 3.12, FLOOR_SIZE - 1.2]} />
            <meshStandardMaterial color="#171c26" roughness={0.88} metalness={0.1} />
          </mesh>
        ))
      )}

      <PerimeterStrip position={[0, 0.06, FLOOR_SIZE / 2 - 0.34]} size={[FLOOR_SIZE - 0.9, 0.06, 0.14]} color="#ff9f6d" />
      <PerimeterStrip position={[0, 0.06, -FLOOR_SIZE / 2 + 0.34]} size={[FLOOR_SIZE - 0.9, 0.06, 0.14]} color="#49bfff" />
      <PerimeterStrip position={[-FLOOR_SIZE / 2 + 0.34, 0.06, 0]} size={[0.14, 0.06, FLOOR_SIZE - 0.9]} color="#6a65ff" />
      <PerimeterStrip position={[FLOOR_SIZE / 2 - 0.34, 0.06, 0]} size={[0.14, 0.06, FLOOR_SIZE - 0.9]} color="#59d6b6" />

      <CommandHalo />
      <WindowBand />
      <FloorSignalLines />
      <BacklineWall
        lockerModelPath={props.assetPack?.lockerModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <CeilingTruss />
    </group>
  );
}

function OfficeZoneDecks() {
  return (
    <group>
      {OFFICE_ZONE_ORDER.map((zoneId) => {
        const zone = OFFICE_ZONE_CONFIG[zoneId];
        return (
          <group key={zoneId} position={zone.anchor}>
            <mesh position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={zone.deckSize} />
              <meshStandardMaterial
                color="#131a24"
                emissive={zone.accent}
                emissiveIntensity={0.08}
                roughness={0.86}
                metalness={0.14}
              />
            </mesh>

            <PerimeterStrip position={[0, 0.04, zone.deckSize[1] / 2]} size={[zone.deckSize[0], 0.03, 0.05]} color={zone.accent} />
            <PerimeterStrip position={[0, 0.04, -zone.deckSize[1] / 2]} size={[zone.deckSize[0], 0.03, 0.05]} color={zone.accent} />
            <PerimeterStrip position={[-zone.deckSize[0] / 2, 0.04, 0]} size={[0.05, 0.03, zone.deckSize[1]]} color={zone.accent} />
            <PerimeterStrip position={[zone.deckSize[0] / 2, 0.04, 0]} size={[0.05, 0.03, zone.deckSize[1]]} color={zone.accent} />

            <Html position={[0, 0.58, zone.deckSize[1] / 2 - 0.12]} center distanceFactor={18} transform={false} occlude={false}>
              <div className="office-zone-label">{officeZoneLabel(zoneId)}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function PerimeterStrip(props: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={props.position}>
      <boxGeometry args={props.size} />
      <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.72} />
    </mesh>
  );
}

function InstancedBoxes(props: {
  items: Array<{
    position: [number, number, number];
    scale: [number, number, number];
    rotation?: [number, number, number];
  }>;
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const meshRef = useRef<ThreeInstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) {
      return;
    }
    props.items.forEach((item, index) => {
      dummy.position.set(item.position[0], item.position[1], item.position[2]);
      dummy.rotation.set(...(item.rotation ?? [0, 0, 0]));
      dummy.scale.set(item.scale[0], item.scale[1], item.scale[2]);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy, props.items]);

  if (props.items.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, props.items.length]}
      castShadow={props.castShadow}
      receiveShadow={props.receiveShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={props.color}
        emissive={props.emissive ?? props.color}
        emissiveIntensity={props.emissiveIntensity ?? 0}
        roughness={props.roughness ?? 0.7}
        metalness={props.metalness ?? 0.18}
        transparent={props.transparent}
        opacity={props.opacity ?? 1}
      />
    </instancedMesh>
  );
}

function CommandHalo() {
  return (
    <group>
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.45, 1.75, 48]} />
        <meshStandardMaterial color="#ffc587" emissive="#ffc587" emissiveIntensity={0.35} side={2} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.5, 2.7, 48]} />
        <meshStandardMaterial color="#2a3d57" emissive="#4e92bc" emissiveIntensity={0.16} side={2} />
      </mesh>
    </group>
  );
}

function WindowBand() {
  const barInstances = useMemo(
    () => [-4.4, 0, 4.4].flatMap((x) => (
      [-0.95, -0.3, 0.34, 0.95].map((column, index) => ({
        position: [x + column, 2.28 + index * 0.04, -8.75] as [number, number, number],
        scale: [0.42, 0.42 + index * 0.16, 0.08] as [number, number, number],
      }))
    )),
    [],
  );
  return (
    <group>
      {[-4.4, 0, 4.4].map((x) => (
        <group key={`window-panel-${x}`} position={[x, 2.36, -8.77]}>
          <mesh>
            <planeGeometry args={[3.6, 1.06]} />
            <meshStandardMaterial color="#0f1621" emissive="#2c4666" emissiveIntensity={0.26} />
          </mesh>
        </group>
      ))}
      <InstancedBoxes
        items={barInstances}
        color="#17202a"
        emissive="#4f78a8"
        emissiveIntensity={0.3}
      />
    </group>
  );
}

function FloorSignalLines() {
  const longitudinalLines = useMemo(
    () => [-5.8, -2.7, 2.7, 5.8].map((x) => ({
      position: [x, 0.03, -0.8] as [number, number, number],
      scale: [0.05, 0.02, 12.2] as [number, number, number],
    })),
    [],
  );
  const lateralLines = useMemo(
    () => [2.1, -1.3, -4.9].map((z) => ({
      position: [0, 0.03, z] as [number, number, number],
      scale: [11.2, 0.02, 0.05] as [number, number, number],
    })),
    [],
  );
  return (
    <group>
      <InstancedBoxes items={longitudinalLines} color="#2c384d" emissive="#355273" emissiveIntensity={0.18} />
      <InstancedBoxes items={lateralLines} color="#253245" emissive="#3f6a94" emissiveIntensity={0.16} />
    </group>
  );
}

function BacklineWall(props: {
  lockerModelPath?: string;
  computerModelPath?: string;
  accessPointModelPath?: string;
}) {
  const indicatorBars = useMemo(
    () => [-2.55, -1.25, 0, 1.25, 2.55].flatMap((x) => (
      [-0.38, -0.1, 0.18, 0.46].map((y) => ({
        position: [x, 0.85 + y, SERVER_WALL_Z + 0.52] as [number, number, number],
        scale: [0.56, 0.12, 0.04] as [number, number, number],
      }))
    )),
    [],
  );
  if (props.lockerModelPath && props.computerModelPath && props.accessPointModelPath) {
    const lockerModelPath = props.lockerModelPath;
    const computerModelPath = props.computerModelPath;
    const accessPointModelPath = props.accessPointModelPath;
    return (
      <group>
        <mesh position={[0, 2.16, SERVER_WALL_Z + 0.08]}>
          <boxGeometry args={[5.2, 0.16, 0.12]} />
          <meshStandardMaterial color="#111824" emissive="#4ab9ff" emissiveIntensity={0.26} />
        </mesh>
        {[-3.24, -1.62, 0, 1.62, 3.24].map((x) => (
          <group key={`server-locker-${x}`} position={[x, 0, SERVER_WALL_Z + 0.12]}>
            <group rotation={[0, Math.PI, 0]}>
              <ModelClone path={lockerModelPath} scale={0.44} />
            </group>
            <group position={[0, 1.24, 0.26]} rotation={[0, Math.PI, 0]}>
              <ModelClone path={computerModelPath} scale={0.56} />
            </group>
          </group>
        ))}
        {[-1.88, 1.88].map((x) => (
          <group key={`server-access-${x}`} position={[x, 1.46, SERVER_WALL_Z + 0.42]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <ModelClone path={accessPointModelPath} scale={0.72} />
          </group>
        ))}
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 1.52, SERVER_WALL_Z]} castShadow receiveShadow>
        <boxGeometry args={[8.1, 2.1, 0.6]} />
        <meshStandardMaterial color="#141a22" roughness={0.82} metalness={0.26} />
      </mesh>
      <mesh position={[0, 2.05, SERVER_WALL_Z + 0.32]}>
        <boxGeometry args={[4.2, 0.9, 0.05]} />
        <meshStandardMaterial color="#0d1218" emissive="#52b7ff" emissiveIntensity={0.48} />
      </mesh>
      {[-2.55, -1.25, 0, 1.25, 2.55].map((x) => (
        <group key={`server-rack-${x}`} position={[x, 0.85, SERVER_WALL_Z + 0.22]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.86, 1.46, 0.58]} />
            <meshStandardMaterial color="#1a212b" roughness={0.74} metalness={0.24} />
          </mesh>
        </group>
      ))}
      <InstancedBoxes
        items={indicatorBars}
        color="#0a121a"
        emissive="#57c8ff"
        emissiveIntensity={0.58}
      />
    </group>
  );
}

function CeilingTruss() {
  const trusses = useMemo(
    () => [-5.4, 0, 5.4].map((x) => ({
      position: [x, 2.86, 0] as [number, number, number],
      scale: [0.22, 0.18, FLOOR_SIZE - 1.1] as [number, number, number],
    })),
    [],
  );
  return (
    <InstancedBoxes items={trusses} color="#171e29" roughness={0.78} metalness={0.22} castShadow />
  );
}

function RuntimeFloorGrid(props: { path: string }) {
  const offsets = [-7.2, -3.6, 0, 3.6, 7.2];
  return (
    <group position={[0, 0.02, 0]}>
      {offsets.flatMap((x) => offsets.map((z) => (
        <group key={`tile-${x}-${z}`} position={[x, 0, z]}>
          <ModelClone path={props.path} scale={[0.9, 1, 0.9]} />
        </group>
      )))}
    </group>
  );
}

function RuntimeWallCladding(props: { wallPath: string; windowWallPath?: string }) {
  const backPanels = [-6, -2, 2, 6];
  const sidePanels = [-6, -2, 2, 6];
  return (
    <group>
      {backPanels.map((x) => {
        const panelPath = Math.abs(x) === 2 ? props.windowWallPath ?? props.wallPath : props.wallPath;
        return (
          <group key={`back-wall-${x}`} position={[x, 0, -8.78]} rotation={[0, Math.PI, 0]}>
            <ModelClone path={panelPath} scale={[1, 1.18, 1]} position={[0, 1.1, 0]} />
          </group>
        );
      })}
      {sidePanels.map((z) => (
        <group key={`left-wall-${z}`} position={[-8.78, 0, z]} rotation={[0, Math.PI / 2, 0]}>
          <ModelClone path={props.wallPath} scale={[1, 1.18, 1]} position={[0, 1.1, 0]} />
        </group>
      ))}
      {sidePanels.map((z) => (
        <group key={`right-wall-${z}`} position={[8.78, 0, z]} rotation={[0, -Math.PI / 2, 0]}>
          <ModelClone path={props.wallPath} scale={[1, 1.18, 1]} position={[0, 1.1, 0]} />
        </group>
      ))}
    </group>
  );
}

function RuntimeColumns(props: { path: string }) {
  const positions: Array<[number, number, number]> = [
    [-7.92, 0, -7.58],
    [7.92, 0, -7.58],
    [-7.92, 0, 7.58],
    [7.92, 0, 7.58],
    [-7.92, 0, 0],
    [7.92, 0, 0],
  ];
  return (
    <group>
      {positions.map((position) => (
        <group key={`column-${position.join("-")}`} position={position}>
          <ModelClone path={props.path} scale={[0.72, 0.62, 0.72]} position={[0, 1.56, 0]} />
        </group>
      ))}
    </group>
  );
}

function OfficeFurniture(props: { assetPack?: OfficeAssetPack }) {
  return (
    <group>
      <StrategyTable
        position={[0, 0, 7.1]}
        deskModelPath={props.assetPack?.deskModelPath}
        commandDeskModelPath={props.assetPack?.commandDeskModelPath}
        chairModelPath={props.assetPack?.chairModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <ConsoleRow
        position={[-7.85, 0, -1.05]}
        accent="#8d88ff"
        deskModelPath={props.assetPack?.deskModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <ConsoleRow
        position={[7.85, 0, -1.05]}
        accent="#ff7466"
        mirrored
        deskModelPath={props.assetPack?.deskModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <CommandDisplayPylons
        columnModelPath={props.assetPack?.roomColumnPath}
        computerModelPath={props.assetPack?.computerModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <ResearchCorner
        lockerModelPath={props.assetPack?.lockerModelPath}
        shelfModelPath={props.assetPack?.shelfModelPath}
        crateModelPath={props.assetPack?.crateModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <SecurityCorner
        lockerModelPath={props.assetPack?.lockerModelPath}
        shelfModelPath={props.assetPack?.shelfModelPath}
        crateModelPath={props.assetPack?.crateModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <SignalPedestals
        columnModelPath={props.assetPack?.roomColumnPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
      />
      <CeilingLamps lightPath={props.assetPack?.roomLightPath} />
    </group>
  );
}

function StrategyTable(props: {
  position: [number, number, number];
  deskModelPath?: string;
  commandDeskModelPath?: string;
  chairModelPath?: string;
  computerModelPath?: string;
  accessPointModelPath?: string;
}) {
  const legInstances = useMemo(
    () => [
      { position: [-1.28, 0.22, -0.48] as [number, number, number], scale: [0.16, 0.42, 0.16] as [number, number, number] },
      { position: [1.28, 0.22, -0.48] as [number, number, number], scale: [0.16, 0.42, 0.16] as [number, number, number] },
      { position: [-1.28, 0.22, 0.48] as [number, number, number], scale: [0.16, 0.42, 0.16] as [number, number, number] },
      { position: [1.28, 0.22, 0.48] as [number, number, number], scale: [0.16, 0.42, 0.16] as [number, number, number] },
    ],
    [],
  );
  const chairSeatInstances = useMemo(
    () => [-0.9, 0, 0.9].map((x) => ({
      position: [x, 0.3, 1.36] as [number, number, number],
      scale: [0.56, 0.08, 0.56] as [number, number, number],
    })),
    [],
  );
  const chairBackInstances = useMemo(
    () => [-0.9, 0, 0.9].map((x) => ({
      position: [x, 0.66, 1.18] as [number, number, number],
      scale: [0.54, 0.64, 0.08] as [number, number, number],
    })),
    [],
  );

  if (props.commandDeskModelPath && props.chairModelPath) {
    const commandDeskModelPath = props.commandDeskModelPath;
    const chairModelPath = props.chairModelPath;
    return (
      <group position={props.position}>
        {[-1.16, 1.16].map((x) => (
          <group key={`strategy-desk-${x}`} position={[x, 0.04, -0.08]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <ModelClone path={commandDeskModelPath} scale={[0.54, 0.54, 0.58]} />
            {props.computerModelPath ? (
              <group position={[0, 0.88, -0.18]} rotation={[0, Math.PI, 0]}>
                <ModelClone path={props.computerModelPath} scale={0.68} />
              </group>
            ) : null}
            {props.accessPointModelPath ? (
              <group position={[0.58, 0.82, 0.12]} rotation={[0, Math.PI / 2, 0]}>
                <ModelClone path={props.accessPointModelPath} scale={0.62} />
              </group>
            ) : null}
          </group>
        ))}
        {[-1.2, 0, 1.2].map((x) => (
          <group key={`strategy-chair-${x}`} position={[x, 0.02, 1.4]} rotation={[0, Math.PI, 0]}>
            <ModelClone path={chairModelPath} scale={0.56} />
          </group>
        ))}
        <mesh position={[0, 0.6, 0.08]}>
          <boxGeometry args={[1.88, 0.1, 1.18]} />
          <meshStandardMaterial color="#10171f" emissive="#58c7ff" emissiveIntensity={0.24} transparent opacity={0.92} />
        </mesh>
        <mesh position={[0, 0.82, 0.08]}>
          <boxGeometry args={[1.18, 0.04, 0.56]} />
          <meshStandardMaterial color="#0c1219" emissive="#77dbff" emissiveIntensity={0.36} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={props.position}>
      <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.1, 0.12, 1.36]} />
        <meshStandardMaterial color="#26303d" roughness={0.62} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.53, 0]}>
        <boxGeometry args={[2.58, 0.02, 0.9]} />
        <meshStandardMaterial color="#0f141d" emissive="#53c7ff" emissiveIntensity={0.26} />
      </mesh>
      <InstancedBoxes items={legInstances} color="#1a202a" roughness={0.78} metalness={0.14} castShadow receiveShadow />
      <InstancedBoxes items={chairSeatInstances} color="#313744" roughness={0.74} castShadow receiveShadow />
      <InstancedBoxes items={chairBackInstances} color="#262d39" roughness={0.72} castShadow receiveShadow />
      {[-0.88, 0.88].map((x) => (
        <mesh key={`table-display-${x}`} position={[x, 0.88, -0.44]}>
          <boxGeometry args={[0.64, 0.28, 0.04]} />
          <meshStandardMaterial color="#111923" emissive="#79d7ff" emissiveIntensity={0.34} />
        </mesh>
      ))}
    </group>
  );
}

function ConsoleRow(props: {
  position: [number, number, number];
  mirrored?: boolean;
  accent: string;
  deskModelPath?: string;
  computerModelPath?: string;
  accessPointModelPath?: string;
}) {
  return (
    <group position={props.position} rotation={[0, props.mirrored ? -Math.PI / 2 : Math.PI / 2, 0]}>
      {[-2.05, -0.68, 0.68, 2.05].map((offset) => (
        <group key={offset} position={[offset, 0, 0]}>
          {props.deskModelPath ? (
            <group position={[0, 0.03, 0.04]} rotation={[0, Math.PI, 0]}>
              <ModelClone path={props.deskModelPath} scale={[0.42, 0.48, 0.44]} />
            </group>
          ) : (
            <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.02, 0.92, 0.72]} />
              <meshStandardMaterial color="#232a36" roughness={0.78} metalness={0.18} />
            </mesh>
          )}
          <mesh position={[0, 0.92, 0.2]}>
            <boxGeometry args={[0.62, 0.3, 0.04]} />
            <meshStandardMaterial color="#0d141d" emissive={props.accent} emissiveIntensity={0.42} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.84, 0.04, 0.46]} />
            <meshStandardMaterial color={props.accent} emissive={props.accent} emissiveIntensity={0.55} />
          </mesh>
          {props.computerModelPath ? (
            <group position={[0, 0.96, 0.06]} rotation={[0, Math.PI, 0]}>
              <ModelClone path={props.computerModelPath} scale={0.52} />
            </group>
          ) : null}
          {props.accessPointModelPath ? (
            <group position={[0.32, 0.96, -0.12]} rotation={[0, Math.PI * 0.5, 0]}>
              <ModelClone path={props.accessPointModelPath} scale={0.58} />
            </group>
          ) : null}
        </group>
      ))}
    </group>
  );
}

function CommandDisplayPylons(props: {
  columnModelPath?: string;
  computerModelPath?: string;
  accessPointModelPath?: string;
}) {
  if (props.columnModelPath && props.computerModelPath) {
    const columnModelPath = props.columnModelPath;
    const computerModelPath = props.computerModelPath;
    return (
      <group>
        {[-2.7, 2.7].map((x) => (
          <group key={`runtime-pylon-${x}`} position={[x, 0, -2.65]}>
            <group position={[0, 0, 0]} scale={[0.4, 0.55, 0.4]}>
              <ModelClone path={columnModelPath} scale={1} />
            </group>
            <group position={[0, 1.44, 0.18]} rotation={[0, Math.PI, 0]}>
              <ModelClone path={computerModelPath} scale={0.68} />
            </group>
            {props.accessPointModelPath ? (
              <group position={[0, 1.8, -0.02]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
                <ModelClone path={props.accessPointModelPath} scale={0.56} />
              </group>
            ) : null}
          </group>
        ))}
      </group>
    );
  }

  return (
    <group>
      {[-2.5, 2.5].map((x) => (
        <group key={`pylon-${x}`} position={[x, 0, -2.45]}>
          <mesh position={[0, 0.82, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.28, 1.64, 0.28]} />
            <meshStandardMaterial color="#1a202b" roughness={0.72} metalness={0.18} />
          </mesh>
          <mesh position={[0, 1.42, 0.16]}>
            <boxGeometry args={[0.2, 0.34, 0.04]} />
            <meshStandardMaterial color="#0c1219" emissive="#57c8ff" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ResearchCorner(props: {
  lockerModelPath?: string;
  shelfModelPath?: string;
  crateModelPath?: string;
  computerModelPath?: string;
  accessPointModelPath?: string;
}) {
  if (props.lockerModelPath && props.shelfModelPath && props.crateModelPath) {
    return (
      <group position={[-7.05, 0, -5.65]}>
        <group position={[-0.78, 0, 0.28]} rotation={[0, Math.PI / 2, 0]}>
          <ModelClone path={props.lockerModelPath} scale={0.44} />
        </group>
        <group position={[0.36, 0, -0.12]} rotation={[0, Math.PI, 0]}>
          <ModelClone path={props.shelfModelPath} scale={0.42} />
        </group>
        <group position={[0.92, 0, 0.56]} rotation={[0, -Math.PI / 7, 0]}>
          <ModelClone path={props.crateModelPath} scale={0.44} />
        </group>
        {props.computerModelPath ? (
          <group position={[0.52, 1.12, 0.08]} rotation={[0, Math.PI * 0.88, 0]}>
            <ModelClone path={props.computerModelPath} scale={0.6} />
          </group>
        ) : null}
        {props.accessPointModelPath ? (
          <group position={[0.04, 1.18, 0.06]} rotation={[0, Math.PI / 2, 0]}>
            <ModelClone path={props.accessPointModelPath} scale={0.72} />
          </group>
        ) : null}
      </group>
    );
  }

  return (
    <group position={[-7.05, 0, -5.65]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.52, 1, 1.08]} />
        <meshStandardMaterial color="#232636" roughness={0.8} metalness={0.16} />
      </mesh>
      <mesh position={[0.08, 1.08, -0.08]}>
        <cylinderGeometry args={[0.24, 0.18, 0.7, 18]} />
        <meshStandardMaterial color="#0f1720" emissive="#9187ff" emissiveIntensity={0.54} />
      </mesh>
      <mesh position={[0.42, 1.18, 0.18]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#141d29" emissive="#c3beff" emissiveIntensity={0.46} />
      </mesh>
    </group>
  );
}

function SecurityCorner(props: {
  lockerModelPath?: string;
  shelfModelPath?: string;
  crateModelPath?: string;
  computerModelPath?: string;
  accessPointModelPath?: string;
}) {
  if (props.lockerModelPath && props.crateModelPath) {
    return (
      <group position={[7.05, 0, -5.65]}>
        <group position={[-0.82, 0, 0.12]} rotation={[0, -Math.PI / 2, 0]}>
          <ModelClone path={props.lockerModelPath} scale={0.44} />
        </group>
        {props.shelfModelPath ? (
          <group position={[0.28, 0, -0.18]} rotation={[0, Math.PI, 0]}>
            <ModelClone path={props.shelfModelPath} scale={0.38} />
          </group>
        ) : null}
        <group position={[0.88, 0, 0.56]} rotation={[0, Math.PI / 9, 0]}>
          <ModelClone path={props.crateModelPath} scale={0.44} />
        </group>
        {props.computerModelPath ? (
          <group position={[0.16, 1.14, 0.12]} rotation={[0, Math.PI * 0.84, 0]}>
            <ModelClone path={props.computerModelPath} scale={0.6} />
          </group>
        ) : null}
        {props.accessPointModelPath ? (
          <group position={[-0.24, 1.18, 0.1]} rotation={[0, Math.PI / 2, 0]}>
            <ModelClone path={props.accessPointModelPath} scale={0.72} />
          </group>
        ) : null}
        {[-0.2, 0.2, 0.6].map((x, index) => (
          <mesh key={`security-alert-${index}`} position={[x, 1.36 - index * 0.16, 0.48]}>
            <boxGeometry args={[0.34, 0.18, 0.04]} />
            <meshStandardMaterial color="#120f15" emissive="#ff7366" emissiveIntensity={0.48 - index * 0.08} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group position={[7.05, 0, -5.65]}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.52, 1.04, 1.08]} />
        <meshStandardMaterial color="#27222a" roughness={0.8} metalness={0.18} />
      </mesh>
      {[
        [-0.24, 1.02] as const,
        [0.24, 1.02] as const,
        [0, 1.32] as const,
      ].map(([x, y], index) => (
        <mesh key={`security-screen-${index}`} position={[x, y, 0.28]}>
          <boxGeometry args={[0.38, 0.22, 0.04]} />
          <meshStandardMaterial color="#120f15" emissive="#ff7366" emissiveIntensity={0.56 - index * 0.08} />
        </mesh>
      ))}
    </group>
  );
}

function SignalPedestals(props: {
  columnModelPath?: string;
  accessPointModelPath?: string;
}) {
  if (props.columnModelPath && props.accessPointModelPath) {
    const columnModelPath = props.columnModelPath;
    const accessPointModelPath = props.accessPointModelPath;
    return (
      <group>
        {[
          { position: [-7.42, 0, 7.02] as [number, number, number], accent: "#5ec4ff", rotation: Math.PI / 2 },
          { position: [7.42, 0, 7.02] as [number, number, number], accent: "#ff9f6d", rotation: -Math.PI / 2 },
        ].map((pedestal) => (
          <group key={pedestal.position.join("-")} position={pedestal.position}>
            <group scale={[0.22, 0.16, 0.22]}>
              <ModelClone path={columnModelPath} scale={1} />
            </group>
            <group position={[0, 0.62, 0]} rotation={[0, pedestal.rotation, 0]}>
              <ModelClone path={accessPointModelPath} scale={0.44} />
            </group>
            <mesh position={[0, 0.92, 0]}>
              <sphereGeometry args={[0.14, 14, 14]} />
              <meshStandardMaterial color="#111824" emissive={pedestal.accent} emissiveIntensity={0.7} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  return (
    <group>
      {[
        [-7.4, 0.42, 6.95] as [number, number, number],
        [7.4, 0.42, 6.95] as [number, number, number],
      ].map((pos, index) => (
        <group key={index} position={pos}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.22, 0.25, 0.26, 16]} />
            <meshStandardMaterial color="#2b3341" roughness={0.72} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0.42, 0]} castShadow>
            <sphereGeometry args={[0.18, 14, 14]} />
            <meshStandardMaterial color="#111824" emissive={index === 0 ? "#5ec4ff" : "#ff9f6d"} emissiveIntensity={0.62} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CeilingLamps(props: { lightPath?: string }) {
  if (props.lightPath) {
    const lightPath = props.lightPath;
    return (
      <group>
        {[-4.2, 0, 4.2].map((x) => (
          <group key={x} position={[x, 2.72, 0]} rotation={[0, 0, 0]}>
            <ModelClone path={lightPath} scale={[1.08, 1.08, 1.08]} />
          </group>
        ))}
      </group>
    );
  }

  return (
    <group>
      {[-4.2, 0, 4.2].map((x) => (
        <group key={x} position={[x, 2.7, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.6, 0.06, 0.7]} />
            <meshStandardMaterial color="#d4dde8" emissive="#88d2ff" emissiveIntensity={0.34} />
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
  deskModelPath?: string;
  accessPointModelPath?: string;
  computerModelPath?: string;
  reducedMotion: boolean;
  motionScalar: number;
}) {
  const avatarRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const preset = operatorPresetPalette(props.operator.preset);
  const positionRef = useRef({ x: 0, y: 1.08, z: 0.42 });

  useFrame((state) => {
    if (!avatarRef.current) {
      return;
    }

    const t = state.clock.elapsedTime;
    const patrolEnabled = props.operator.activityState === "idle_patrol" && !props.reducedMotion;
    const patrolRadius = patrolEnabled ? 0.42 : 0;
    const targetX = patrolEnabled ? Math.cos(t * 0.38) * patrolRadius : 0;
    const targetZ = patrolEnabled ? Math.sin(t * 0.42) * patrolRadius * 0.55 + 0.42 : 0.42;
    const targetY = 1.08 + (props.reducedMotion ? 0.01 : 0.035 * props.motionScalar) * Math.sin(t * 1.15);

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
        <cylinderGeometry args={[0.9, 0.98, 0.14, 36]} />
        <meshStandardMaterial color="#575247" roughness={0.84} />
      </mesh>

      <pointLight position={[0, 2.2, 0.55]} intensity={0.5} color="#ffe2b5" distance={5.5} />

      {props.deskModelPath ? (
        <>
          <group position={[0, 0.05, 0.14]} rotation={[0, Math.PI, 0]}>
            <ModelClone path={props.deskModelPath} scale={[0.78, 0.72, 0.78]} />
          </group>
          {props.computerModelPath ? (
            <group position={[0, 0.92, -0.12]} rotation={[0, Math.PI, 0]}>
              <ModelClone path={props.computerModelPath} scale={0.84} />
            </group>
          ) : null}
          {props.accessPointModelPath ? (
            <group position={[0.64, 0.9, 0.22]} rotation={[0, Math.PI / 2, 0]}>
              <ModelClone path={props.accessPointModelPath} scale={0.82} />
            </group>
          ) : null}
        </>
      ) : (
        <>
          <mesh position={[0, 0.9, 0.08]} castShadow receiveShadow>
            <boxGeometry args={[1.58, 0.08, 0.88]} />
            <meshStandardMaterial color="#313743" roughness={0.66} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0.93, 0.08]}>
            <boxGeometry args={[1.16, 0.02, 0.44]} />
            <meshStandardMaterial color="#0f141d" emissive="#57c8ff" emissiveIntensity={0.26} />
          </mesh>

          <mesh position={[0, 0.7, 0.42]} castShadow receiveShadow>
            <boxGeometry args={[0.56, 0.08, 0.56]} />
            <meshStandardMaterial color="#343945" roughness={0.76} />
          </mesh>
          <mesh position={[0, 1.02, 0.2]} castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.58, 0.08]} />
            <meshStandardMaterial color="#282e39" roughness={0.74} />
          </mesh>
        </>
      )}

      <mesh position={[0, 1.26, -0.34]} castShadow>
        <boxGeometry args={[1.22, 0.42, 0.05]} />
        <meshStandardMaterial color="#10161f" emissive={preset.accent} emissiveIntensity={0.28} />
      </mesh>
      {[-0.62, 0.62].map((x) => (
        <mesh key={`operator-side-screen-${x}`} position={[x, 1.16, -0.08]} rotation={[-0.16, x < 0 ? 0.24 : -0.24, 0]}>
          <boxGeometry args={[0.42, 0.24, 0.04]} />
          <meshStandardMaterial color="#111923" emissive="#79d7ff" emissiveIntensity={0.22} />
        </mesh>
      ))}

      <group ref={avatarRef} position={[0, 1.08, 0.42]}>
        <Suspense fallback={<ProceduralOperator preset={props.operator.preset} />}>
          {props.modelPath ? (
            <ModelClone path={props.modelPath} scale={0.9} rotation={[0, Math.PI, 0]} />
          ) : (
            <group scale={1.18}>
              <ProceduralOperator preset={props.operator.preset} />
            </group>
          )}
        </Suspense>
      </group>

      <SelectionRing selected={props.selected} />

      {(props.selected || hovered) ? (
        <Html position={[0, 2.45, 0.22]} center distanceFactor={12} transform={false} occlude={false}>
          <div className={`office-thought-html ${props.selected ? "selected" : ""}`}>
            <p className="name">{props.operator.name}</p>
            <p className="meta">Goatherder | Command Hub</p>
            <div className="office-thought-flags">
              <span className="office-thought-chip office-thought-chip-command">Operator</span>
              <span className="office-thought-chip office-thought-chip-active">
                {props.operator.activityState === "command_center" ? "Command Center" : "Patrol"}
              </span>
            </div>
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
  assetPack?: OfficeAssetPack;
  reducedMotion: boolean;
  motionScalar: number;
  idleMillingEnabled: boolean;
  reducedSecondaryMotion: boolean;
  compactDetail: boolean;
}) {
  const avatarRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [x, y, z] = props.agent.position;
  const localPosRef = useRef({ x: 0, y: 0.82, z: 0.1 });

  useFrame((state) => {
    if (!avatarRef.current) {
      return;
    }

    const t = state.clock.elapsedTime + props.phaseOffset;
    const seatTarget = { x: 0, y: 0.76, z: 0.1 };
    const target = { ...seatTarget };
    const reduced = props.reducedMotion || props.reducedSecondaryMotion;

    if (props.agent.activityState === "idle_milling" && props.idleMillingEnabled && !reduced) {
      target.x = Math.cos(t * 0.62) * 0.34;
      target.z = Math.sin(t * 0.95) * 0.18 + 0.08;
      target.y = 0.82 + Math.sin(t * 1.45) * 0.03 * props.motionScalar;
    } else if (props.agent.activityState === "transitioning_to_desk" && !reduced) {
      const blend = Math.min(1, (Math.sin(t * 1.15) + 1) * 0.5);
      target.x = Math.cos(t * 0.8) * 0.12 * (1 - blend);
      target.z = 0.1 + Math.sin(t * 0.8) * 0.05 * (1 - blend);
      target.y = 0.79 + Math.sin(t * 1.8) * 0.02 * props.motionScalar;
    } else if (props.agent.activityState === "alert_response" && !reduced) {
      target.x = Math.sin(t * 4.4) * 0.05;
      target.z = 0.14 + Math.sin(t * 6.2) * 0.028;
      target.y = 0.84 + Math.abs(Math.sin(t * 4.8)) * 0.03 * props.motionScalar;
    } else {
      target.y = 0.79 + Math.sin(t * 2.4) * (reduced ? 0.008 : 0.02 * props.motionScalar);
      if (props.agent.activityState === "collaborating" && !reduced) {
        target.z = 0.1 + Math.sin(t * 5.8) * 0.015;
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
    } else if (props.agent.activityState === "alert_response" && !reduced) {
      const heading = Math.sin(t * 5.2) > 0 ? Math.PI * 0.82 : Math.PI * 1.18;
      avatarRef.current.rotation.y += (heading - avatarRef.current.rotation.y) * 0.22;
    } else {
      avatarRef.current.rotation.y += (Math.PI - avatarRef.current.rotation.y) * 0.18;
    }

    const pulseBase = props.selected ? 1.03 : 1;
    const activePulse = props.agent.activityState === "working_seated" || props.agent.activityState === "collaborating";
    const alertPulse = props.agent.activityState === "alert_response";
    const pulseAmp = reduced
      ? 0.003
      : alertPulse
        ? 0.016 * props.motionScalar
        : activePulse
          ? 0.01 * props.motionScalar
          : 0.005 * props.motionScalar;
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
        zoneId={props.agent.zoneId}
        deskModelPath={props.assetPack?.deskModelPath}
        chairModelPath={props.assetPack?.chairModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        mugModelPath={props.assetPack?.mugModelPath}
        compactDetail={props.compactDetail}
      />

      <group ref={avatarRef} position={[0, 0.82, 0.1]}>
        <Suspense fallback={<ProceduralGoat status={props.agent.status} risk={props.agent.risk} />}>
          {props.goatModelPath ? (
            <GoatModelClone
              path={props.goatModelPath}
              scale={props.compactDetail ? 0.44 : 0.48}
              rotationY={Math.PI}
              activityState={props.agent.activityState}
              risk={props.agent.risk}
              reducedMotion={props.reducedMotion}
              motionScalar={props.motionScalar}
              reducedSecondaryMotion={props.reducedSecondaryMotion}
            />
          ) : (
            <ProceduralGoat status={props.agent.status} risk={props.agent.risk} />
          )}
        </Suspense>
      </group>

      {(props.selected || hovered || props.agent.status === "active" || props.agent.attentionLevel !== "stable") ? (
        <StatusBadge
          status={props.agent.status}
          risk={props.agent.risk}
          activityState={props.agent.activityState}
        />
      ) : null}
      <SelectionRing selected={props.selected} />

      {(props.selected || props.agent.status === "active" || hovered) ? (
        <Html position={[0, 2.02, 0]} center distanceFactor={11} transform={false} occlude={false}>
          <div className={`office-thought-html ${props.selected ? "selected" : ""}`}>
            <p className="name">{props.agent.name}</p>
            <p className="meta">{props.agent.title} | {props.agent.zoneLabel}</p>
            <div className="office-thought-flags">
              <span className={`office-thought-chip office-thought-chip-${props.agent.zoneId}`}>
                {props.agent.zoneLabel}
              </span>
              <span className={`office-thought-chip office-thought-chip-${activityChipKind(props.agent.activityState, props.agent.risk)}`}>
                {activityLabel(props.agent.activityState)}
              </span>
              <span className={`office-thought-chip office-thought-chip-${attentionChipKind(props.agent.attentionLevel)}`}>
                {attentionLabel(props.agent.attentionLevel)}
              </span>
            </div>
            <p className="thought">{truncate(props.agent.currentThought, 100)}</p>
            {props.agent.behaviorDirective ? (
              <p className="office-thought-directive">{truncate(props.agent.behaviorDirective, 96)}</p>
            ) : null}
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
  zoneId: OfficeZoneId;
  deskModelPath?: string;
  chairModelPath?: string;
  accessPointModelPath?: string;
  computerModelPath?: string;
  mugModelPath?: string;
  compactDetail?: boolean;
}) {
  const deskColor = deskTone(props.status, props.risk, props.selected, props.hovered);
  const screenColor = screenGlow(props.status, props.risk, props.activityState);
  const zoneAccent = zoneAccentColor(props.zoneId);
  const activeGlow = props.activityState === "alert_response"
    ? 0.82
    : props.activityState === "collaborating"
      ? 0.66
      : props.activityState === "working_seated"
        ? 0.52
        : 0.42;

  if (props.deskModelPath) {
    return (
      <group>
        <group position={[0, 0.04, 0.06]} rotation={[0, Math.PI, 0]}>
          <ModelClone path={props.deskModelPath} scale={[0.58, 0.58, 0.72]} />
        </group>

        {props.chairModelPath ? (
          <group position={[0, 0.02, 0.68]} rotation={[0, Math.PI, 0]}>
            <ModelClone path={props.chairModelPath} scale={0.52} />
          </group>
        ) : null}

        {props.computerModelPath ? (
          <group position={[0, 0.7, -0.2]} rotation={[0, Math.PI, 0]}>
            <ModelClone path={props.computerModelPath} scale={0.7} />
          </group>
        ) : null}

        {props.accessPointModelPath ? (
          <group position={[0.56, 0.56, 0.18]} rotation={[0, Math.PI / 2, 0]}>
            {props.compactDetail ? null : <ModelClone path={props.accessPointModelPath} scale={0.66} />}
          </group>
        ) : null}

        {props.mugModelPath ? (
          <group position={[0.3, 0.5, 0.08]} rotation={[0, Math.PI / 5, 0]}>
            {props.compactDetail ? null : <ModelClone path={props.mugModelPath} scale={0.46} />}
          </group>
        ) : null}

        <mesh position={[0, 0.46, 0.44]} castShadow>
          <boxGeometry args={[1.1, 0.03, 0.05]} />
          <meshStandardMaterial color={zoneAccent} emissive={zoneAccent} emissiveIntensity={0.42} />
        </mesh>
        <mesh position={[0, 0.68, -0.08]} castShadow>
          <boxGeometry args={[0.56, 0.18, 0.03]} />
          <meshStandardMaterial color="#0d1218" emissive={screenColor} emissiveIntensity={activeGlow} />
        </mesh>
        <mesh position={[0.64, 0.62, -0.18]} castShadow>
          <boxGeometry args={[0.08, 0.34, 0.08]} />
          <meshStandardMaterial
            color="#0d1218"
            emissive={activityBeaconColor(props.activityState, props.risk, props.zoneId)}
            emissiveIntensity={0.72}
          />
        </mesh>

        <DeskClutter status={props.status} risk={props.risk} />
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.58, 0.08, 1.02]} />
        <meshStandardMaterial color={deskColor} roughness={0.7} metalness={0.06} />
      </mesh>

      <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.42, 0.22]} />
        <meshStandardMaterial color="#3f3d39" roughness={0.82} />
      </mesh>

      <mesh position={[0, 0.25, 0.48]} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.36, 0.5]} />
        <meshStandardMaterial color="#343944" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.54, 0.31]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.44, 0.06]} />
        <meshStandardMaterial color="#282d38" roughness={0.78} />
      </mesh>

      <mesh position={[0, 0.82, -0.34]} castShadow>
        <boxGeometry args={[0.92, 0.42, 0.05]} />
        <meshStandardMaterial color="#3a3935" roughness={0.45} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.82, -0.31]} castShadow>
        <boxGeometry args={[0.78, 0.3, 0.02]} />
        <meshStandardMaterial color="#0e1518" emissive={screenColor} emissiveIntensity={activeGlow} />
      </mesh>

      <mesh position={[0, 0.46, 0.48]} castShadow>
        <boxGeometry args={[1.18, 0.03, 0.05]} />
        <meshStandardMaterial color={zoneAccent} emissive={zoneAccent} emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0.64, 0.58, -0.28]} castShadow>
        <boxGeometry args={[0.08, 0.34, 0.08]} />
        <meshStandardMaterial
          color="#0d1218"
          emissive={activityBeaconColor(props.activityState, props.risk, props.zoneId)}
          emissiveIntensity={0.72}
        />
      </mesh>

      <mesh position={[0, 0.46, -0.02]} castShadow>
        <boxGeometry args={[0.54, 0.02, 0.18]} />
        <meshStandardMaterial color="#3d3a35" roughness={0.5} metalness={0.2} />
      </mesh>

      <DeskClutter status={props.status} risk={props.risk} />
    </group>
  );
}

function ZonePreviewStations(props: { assetPack?: OfficeAssetPack }) {
  const previewSlots: Array<{ zoneId: OfficeZoneId; position: [number, number, number]; rotationY: number }> = [
    { zoneId: "command", position: [-6.85, 0, 5.72], rotationY: Math.PI * 0.14 },
    { zoneId: "build", position: [6.85, 0, 5.72], rotationY: -Math.PI * 0.14 },
    { zoneId: "research", position: [-6.88, 0, -0.82], rotationY: Math.PI * 0.38 },
    { zoneId: "security", position: [6.88, 0, -0.82], rotationY: -Math.PI * 0.38 },
    { zoneId: "operations", position: [0, 0, -7.05], rotationY: Math.PI },
  ];

  return (
    <group>
      {previewSlots.map((slot) => (
        <group key={`${slot.zoneId}-preview`} position={slot.position} rotation={[0, slot.rotationY, 0]}>
          <ShadowBlob radius={0.98} opacity={0.12} />
          <DeskKit
        status="idle"
        risk="none"
        selected={false}
        hovered={false}
        activityState="idle_milling"
        zoneId={slot.zoneId}
        deskModelPath={props.assetPack?.deskModelPath}
        chairModelPath={props.assetPack?.chairModelPath}
        accessPointModelPath={props.assetPack?.accessPointModelPath}
        computerModelPath={props.assetPack?.computerModelPath}
        mugModelPath={props.assetPack?.mugModelPath}
        compactDetail
      />
    </group>
  ))}
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
  activityState: OfficeActivityState;
}) {
  const badge = statusBadge(props.status, props.risk, props.activityState);
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
  scale: number | [number, number, number];
  rotation?: [number, number, number];
  position?: [number, number, number];
}) {
  const gltf = useGLTF(props.path);
  return (
    <Clone
      object={gltf.scene}
      scale={props.scale}
      rotation={props.rotation ?? [0, 0, 0]}
      position={props.position ?? [0, 0, 0]}
    />
  );
}

function GoatModelClone(props: {
  path: string;
  scale: number;
  rotationY?: number;
  activityState: OfficeActivityState;
  risk: OfficeDeskAgent["risk"];
  reducedMotion: boolean;
  motionScalar: number;
  reducedSecondaryMotion: boolean;
}) {
  const gltf = useGLTF(props.path) as { scene: Group; animations?: AnimationClip[] };
  const rootRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);

  useEffect(() => {
    const root = rootRef.current as (Group & { traverse?: (cb: (child: { name?: string; visible?: boolean }) => void) => void }) | null;
    if (!root || typeof root.traverse !== "function") {
      return;
    }
    root.traverse((child) => {
      const name = child.name?.toLowerCase() ?? "";
      if (
        name === "shadow_catcher"
        || name === "light_group"
        || name === "camera"
        || name === "goat_02"
        || name === "goat.001"
        || name === "geometry.001"
      ) {
        child.visible = false;
      }
    });
  }, [props.path]);

  useEffect(() => {
    const root = rootRef.current;
    const clips = gltf.animations ?? [];
    if (!root || clips.length === 0) {
      mixerRef.current = null;
      return;
    }

    const mixer = new AnimationMixer(root);
    mixerRef.current = mixer;
    const clip = selectGoatClip(clips, props.activityState, props.risk);
    const action = mixer.clipAction(clip, root);
    action.reset();
    action.setLoop(LoopRepeat, Infinity);
    action.timeScale = goatClipTimeScale(
      props.activityState,
      props.motionScalar,
      props.risk,
      props.reducedMotion || props.reducedSecondaryMotion,
    );
    action.fadeIn(0.18);
    action.play();

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      mixerRef.current = null;
    };
  }, [
    gltf.animations,
    props.activityState,
    props.motionScalar,
    props.path,
    props.reducedMotion,
    props.reducedSecondaryMotion,
    props.risk,
  ]);

  useFrame((_state, delta) => {
    if (!mixerRef.current) {
      return;
    }
    mixerRef.current.update(Math.min(delta, 0.05));
  });

  return (
    <group ref={rootRef} scale={props.scale} rotation={[0, props.rotationY ?? 0, 0]}>
      <Clone object={gltf.scene} />
    </group>
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

function buildZonedLayout(agents: OfficeDeskAgent[]): DeskAgentLayout[] {
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

  const layouts: DeskAgentLayout[] = [];
  for (const zoneId of OFFICE_ZONE_ORDER) {
    const zoneAgents = grouped.get(zoneId) ?? [];
    const zone = OFFICE_ZONE_CONFIG[zoneId];
    const { columns, rowCount } = zoneGridDimensions(zoneId, zoneAgents.length);

    zoneAgents.forEach((agent, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const [xOffset, zOffset] = deskSlotOffset(zoneId, column, row, columns, rowCount);
      const x = zone.anchor[0] + xOffset;
      const z = zone.anchor[2] + zOffset;
      const columnLean = columns > 1 ? (column - (columns - 1) / 2) * 0.05 : 0;
      layouts.push({
        ...agent,
        zoneId,
        zoneLabel: agent.zoneLabel ?? officeZoneLabel(zoneId),
        position: [x, 0, z],
        rotationY: zone.facing + columnLean,
      });
    });
  }

  return layouts;
}

function zoneGridDimensions(
  zoneId: OfficeZoneId,
  count: number,
): { columns: number; rowCount: number } {
  if (count <= 0) {
    return { columns: 1, rowCount: 1 };
  }
  const zone = OFFICE_ZONE_CONFIG[zoneId];
  const lateralSpan = (zone.axis === "x" ? zone.deckSize[0] : zone.deckSize[1]) - 1.15;
  const minimumSpacing = zoneId === "operations" ? 1.9 : zone.axis === "x" ? 2.05 : 1.85;
  const maxColumns = Math.max(1, Math.floor(lateralSpan / minimumSpacing));
  const preferredColumns = count >= 10
    ? maxColumns
    : count >= 7
      ? Math.min(maxColumns, 3)
      : count >= 4
        ? Math.min(maxColumns, 2)
        : 1;
  const columns = Math.max(1, Math.min(maxColumns, preferredColumns));
  return {
    columns,
    rowCount: Math.max(1, Math.ceil(count / columns)),
  };
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
  activityState: OfficeActivityState,
): string {
  if (activityState === "alert_response") {
    return "#d94c43";
  }
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

function deskSlotOffset(
  zoneId: OfficeZoneId,
  column: number,
  row: number,
  columns: number,
  rowCount: number,
): [number, number] {
  const zone = OFFICE_ZONE_CONFIG[zoneId];
  const lateralSpan = (zone.axis === "x" ? zone.deckSize[0] : zone.deckSize[1]) - 1.2;
  const depthSpan = (zone.axis === "x" ? zone.deckSize[1] : zone.deckSize[0]) - 1.15;
  const baseLateralSpacing = zoneId === "operations" ? 2.08 : zone.axis === "x" ? 2.22 : 1.98;
  const baseDepthSpacing = zoneId === "operations" ? 1.92 : zone.axis === "x" ? 2.08 : 2.16;
  const lateralSpacing = columns > 1
    ? Math.min(baseLateralSpacing, lateralSpan / Math.max(1, columns - 1))
    : 0;
  const depthSpacing = rowCount > 1
    ? Math.min(baseDepthSpacing, depthSpan / Math.max(1, rowCount - 1))
    : 0;
  const lateral = (column - (columns - 1) / 2) * lateralSpacing;
  const depth = (row - (rowCount - 1) / 2) * depthSpacing;
  const rowStagger = columns > 1 && row % 2 === 1 ? Math.min(0.18, lateralSpacing * 0.08) : 0;
  if (zone.axis === "x") {
    return [lateral + rowStagger, depth];
  }
  return [depth, lateral + rowStagger];
}

function zoneAccentColor(zoneId: OfficeZoneId): string {
  return OFFICE_ZONE_CONFIG[zoneId].accent;
}

function activityBeaconColor(
  activityState: OfficeActivityState,
  risk: OfficeDeskAgent["risk"],
  zoneId: OfficeZoneId,
): string {
  if (activityState === "alert_response" || risk === "blocked" || risk === "error") {
    return "#ff7566";
  }
  if (risk === "approval") {
    return "#ffd36b";
  }
  if (activityState === "collaborating") {
    return "#67d7c3";
  }
  if (activityState === "working_seated") {
    return zoneAccentColor(zoneId);
  }
  return "#5d738f";
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

function selectGoatClip(
  clips: AnimationClip[],
  activityState: OfficeActivityState,
  risk: OfficeDeskAgent["risk"],
): AnimationClip {
  const normalized = clips.map((clip) => ({
    clip,
    key: clip.name.toLowerCase(),
  }));

  const matchByKeywords = (...keywords: string[]) => (
    normalized.find(({ key }) => keywords.some((keyword) => key.includes(keyword)))?.clip
  );

  if (activityState === "alert_response" || risk === "blocked" || risk === "error") {
    return (
      matchByKeywords("run", "gallop", "trot", "jump", "attack", "alert", "walk")
      ?? clips[0]!
    );
  }
  if (activityState === "transitioning_to_desk") {
    return (
      matchByKeywords("walk", "trot", "run", "move", "locomotion")
      ?? clips[0]!
    );
  }
  if (activityState === "collaborating") {
    return (
      matchByKeywords("interact", "talk", "look", "turn", "idle")
      ?? clips[0]!
    );
  }
  if (activityState === "working_seated") {
    return (
      matchByKeywords("idle", "stand", "breathe", "look")
      ?? clips[0]!
    );
  }
  return (
    matchByKeywords("idle", "stand", "graze", "look")
    ?? clips[0]!
  );
}

function goatClipTimeScale(
  activityState: OfficeActivityState,
  motionScalar: number,
  risk: OfficeDeskAgent["risk"],
  reducedMotion: boolean,
): number {
  if (reducedMotion) {
    return 0.72;
  }
  if (activityState === "alert_response" || risk === "blocked" || risk === "error") {
    return 1.18 + motionScalar * 0.28;
  }
  if (activityState === "transitioning_to_desk") {
    return 0.96 + motionScalar * 0.24;
  }
  if (activityState === "collaborating") {
    return 0.88 + motionScalar * 0.18;
  }
  if (activityState === "working_seated") {
    return 0.8 + motionScalar * 0.08;
  }
  return 0.74 + motionScalar * 0.06;
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
