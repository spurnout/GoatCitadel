import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";

export interface OfficeDeskAgent {
  roleId: string;
  name: string;
  title: string;
  status: "active" | "idle" | "ready";
  risk: "none" | "approval" | "blocked" | "error";
  currentThought: string;
  lastSeenAt?: string;
}

interface OfficeCanvasProps {
  agents: OfficeDeskAgent[];
  selectedRoleId?: string;
  onSelect: (roleId: string) => void;
}

interface DeskAgentLayout extends OfficeDeskAgent {
  position: [number, number, number];
}

export const OfficeCanvas = memo(function OfficeCanvas(props: OfficeCanvasProps) {
  const layout = useMemo(() => buildLayout(props.agents), [props.agents]);

  return (
    <div className="office-webgl-stage">
      <Canvas
        camera={{ position: [0, 8.8, 12.5], fov: 48 }}
        shadows
        dpr={[1, 1.8]}
      >
        <color attach="background" args={["#1a0f08"]} />
        <fog attach="fog" args={["#1a0f08", 12, 28]} />
        <ambientLight intensity={0.55} />
        <hemisphereLight
          color="#ffd2a1"
          groundColor="#2b160d"
          intensity={0.35}
        />
        <directionalLight
          position={[8, 12, 5]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <OfficeRoom />
        {layout.map((agent, index) => (
          <AgentDesk
            key={agent.roleId}
            agent={agent}
            selected={props.selectedRoleId === agent.roleId}
            onSelect={props.onSelect}
            phaseOffset={index * 0.57}
          />
        ))}
        <OrbitControls
          makeDefault
          target={[0, 1.2, 0]}
          maxPolarAngle={Math.PI / 2.2}
          minPolarAngle={Math.PI / 5}
          minDistance={8}
          maxDistance={18}
          enablePan={false}
        />
      </Canvas>
    </div>
  );
});

function OfficeRoom() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 18]} />
        <meshStandardMaterial color="#2b190f" roughness={0.9} metalness={0.05} />
      </mesh>

      <mesh position={[0, 3.8, -8]} receiveShadow>
        <boxGeometry args={[24, 7.6, 0.25]} />
        <meshStandardMaterial color="#2f1910" roughness={0.82} />
      </mesh>

      <mesh position={[-12, 3.8, 0]} receiveShadow>
        <boxGeometry args={[0.25, 7.6, 16]} />
        <meshStandardMaterial color="#28160d" roughness={0.86} />
      </mesh>

      <mesh position={[12, 3.8, 0]} receiveShadow>
        <boxGeometry args={[0.25, 7.6, 16]} />
        <meshStandardMaterial color="#28160d" roughness={0.86} />
      </mesh>
    </group>
  );
}

function AgentDesk(props: {
  agent: DeskAgentLayout;
  selected: boolean;
  onSelect: (roleId: string) => void;
  phaseOffset: number;
}) {
  const avatarRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [x, y, z] = props.agent.position;

  useFrame((state) => {
    if (!avatarRef.current) {
      return;
    }
    const activePulse = props.agent.status === "active" ? 1 : 0.5;
    avatarRef.current.position.y =
      1.25 + Math.sin(state.clock.elapsedTime * (1.8 + activePulse) + props.phaseOffset) * 0.08;
    const pulse = props.selected ? 1.2 : 1;
    avatarRef.current.scale.setScalar(
      pulse + Math.sin(state.clock.elapsedTime * 2 + props.phaseOffset) * 0.02,
    );
  });

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    props.onSelect(props.agent.roleId);
  };

  const deskColor = pickDeskColor(props.agent.status, props.agent.risk, hovered, props.selected);
  const avatarColor = pickAvatarColor(props.agent.status, props.agent.risk);

  return (
    <group
      position={[x, y, z]}
      onClick={onClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.36, 1.45]} />
        <meshStandardMaterial color={deskColor} roughness={0.65} metalness={0.08} />
      </mesh>

      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#1f120b" />
      </mesh>

      <mesh position={[0, 0.78, -0.42]} castShadow>
        <boxGeometry args={[1.15, 0.6, 0.06]} />
        <meshStandardMaterial color="#19120f" emissive="#2f1a0f" emissiveIntensity={0.35} />
      </mesh>

      <mesh ref={avatarRef} position={[0, 1.25, 0.22]} castShadow>
        <sphereGeometry args={[0.29, 24, 24]} />
        <meshStandardMaterial
          color={avatarColor}
          emissive={avatarColor}
          emissiveIntensity={props.agent.status === "active" ? 0.35 : 0.15}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[1.0, 1.25, 48]} />
        <meshStandardMaterial
          color={props.selected ? "#ffc58b" : "#4a2a18"}
          emissive={props.selected ? "#ff9a3d" : "#2b180e"}
          emissiveIntensity={props.selected ? 0.4 : 0.08}
          side={2}
        />
      </mesh>

      {(props.selected || props.agent.status === "active" || hovered) ? (
        <Html
          position={[0, 2.05, 0]}
          center
          distanceFactor={11}
          occlude={false}
          transform={false}
        >
          <div className={`office-thought-html ${props.selected ? "selected" : ""}`}>
            <p className="name">{props.agent.name}</p>
            <p className="thought">{truncate(props.agent.currentThought, 100)}</p>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function pickDeskColor(
  status: OfficeDeskAgent["status"],
  risk: OfficeDeskAgent["risk"],
  hovered: boolean,
  selected: boolean,
): string {
  if (risk === "blocked" || risk === "error") {
    return selected ? "#6d2d2d" : "#532222";
  }
  if (risk === "approval") {
    return selected ? "#6e4c1f" : "#503713";
  }
  if (status === "active") {
    return selected ? "#4f3a1a" : hovered ? "#3f2c15" : "#342412";
  }
  if (status === "ready") {
    return selected ? "#374328" : "#2a321f";
  }
  return selected ? "#3a2a1a" : "#2b1d12";
}

function pickAvatarColor(
  status: OfficeDeskAgent["status"],
  risk: OfficeDeskAgent["risk"],
): string {
  if (risk === "blocked" || risk === "error") {
    return "#ff6d6d";
  }
  if (risk === "approval") {
    return "#ffcf6a";
  }
  if (status === "active") {
    return "#7ce9ad";
  }
  if (status === "ready") {
    return "#b7db88";
  }
  return "#ffb87a";
}

function buildLayout(agents: OfficeDeskAgent[]): DeskAgentLayout[] {
  const columns = Math.max(2, Math.ceil(Math.sqrt(agents.length)));
  const spacingX = 3.6;
  const spacingZ = 3.1;
  const xOffset = ((columns - 1) * spacingX) / 2;

  return agents.map((agent, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      ...agent,
      position: [col * spacingX - xOffset, 0, row * spacingZ - 4],
    };
  });
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
