import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { attachWebglResilience } from '@/lib/utils/webglResilience';
import * as THREE from 'three';

// TavernLighting co-located here — zero props, no external deps; only used inside this scene.
function TavernLighting() {
  const particlesRef = React.useRef<THREE.Points>(null);

  const particles = React.useMemo(() => {
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20; // X
      positions[i * 3 + 1] = Math.random() * 8; // Y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10; // Z
    }

    return positions;
  }, []);

  React.useEffect(() => {
    const animateParticles = () => {
      if (particlesRef.current) {
        // Optional chain: geometry is a THREE.Points property (not present in DOM mock env)
        const posAttr = particlesRef.current.geometry?.attributes?.position;
        if (posAttr) {
          const positions = posAttr.array as Float32Array;
          for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += Math.sin(Date.now() * 0.001 + positions[i]) * 0.01;
          }
          posAttr.needsUpdate = true;
        }
      }
      requestAnimationFrame(animateParticles);
    };

    animateParticles();
  }, []);

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffaa44"
        size={0.1}
        transparent
        opacity={0.6}
        alphaTest={0.1}
      />
    </points>
  );
}

// dpr is owned inside this component — never a controlled prop-receiver.
// PerformanceMonitor adjusting dpr re-renders only TavernScene, not Lobby.
// The WebGL context is NOT re-created because dpr is internal state, not a prop.
export const TavernScene = React.memo(function TavernScene({ isMobile }: { isMobile: boolean }) {
  const [dpr, setDpr] = useState<number>(Math.min(window.devicePixelRatio, 2));

  return (
    <Canvas
      camera={{ position: [0, 2, 8], fov: 120 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      dpr={dpr}
      gl={{ antialias: !isMobile, alpha: true }}
      onCreated={attachWebglResilience}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(d - 0.5, 1))}
        onIncline={() => setDpr((d) => Math.min(d + 0.5, 2))}
      >
        <Suspense fallback={null}>
          <TavernLighting />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  );
});
