import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '../../lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS: Record<string, number> = {
  hook: 7000,
  speed: 10000,
  offline: 9000,
  control: 11000,
  close: 8000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: Scene1,
  speed: Scene2,
  offline: Scene3,
  control: Scene4,
  close: Scene5,
};

const SCENE_KEYS = Object.keys(SCENE_DURATIONS);

const orb1Pos = [
  { x: '10vw', y: '15vh', scale: 2.2 },
  { x: '65vw', y: '5vh', scale: 1.6 },
  { x: '5vw', y: '55vh', scale: 1.9 },
  { x: '70vw', y: '60vh', scale: 2.5 },
  { x: '35vw', y: '20vh', scale: 3 },
];

const orb2Pos = [
  { x: '75vw', y: '60vh', scale: 1.8 },
  { x: '15vw', y: '70vh', scale: 2.4 },
  { x: '80vw', y: '20vh', scale: 1.5 },
  { x: '10vw', y: '10vh', scale: 2 },
  { x: '60vw', y: '65vh', scale: 2.2 },
];

const accentLine = [
  { left: '8%', width: '35%', top: '58%' },
  { left: '55%', width: '40%', top: '22%' },
  { left: '5%', width: '50%', top: '75%' },
  { left: '60%', width: '30%', top: '18%' },
  { left: '20%', width: '60%', top: '65%' },
];

interface VideoTemplateProps {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
}

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: VideoTemplateProps = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = SCENE_KEYS.indexOf(baseSceneKey);
  const sc = sceneIndex >= 0 ? sceneIndex : 0;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0A1628]">
      {/* Cinematic video background */}
      <video
        src={`${import.meta.env.BASE_URL}videos/bg-particles.mp4`}
        autoPlay muted loop playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-screen"
      />

      {/* Persistent background image — shifts per scene */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: sc === 0 || sc === 4 ? 0.35 : 0.15 }}
        transition={{ duration: 1.5 }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/bg-uae-luxury.png`}
          className="w-full h-full object-cover"
          alt=""
        />
      </motion.div>

      {/* Persistent drifting gradient orbs — live outside AnimatePresence */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #4F8EF7 0%, transparent 70%)', filter: 'blur(80px)', opacity: 0.25 }}
        animate={orb1Pos[sc]}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute w-[35vw] h-[35vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #F4A925 0%, transparent 70%)', filter: 'blur(90px)', opacity: 0.18 }}
        animate={orb2Pos[sc]}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Persistent accent line */}
      <motion.div
        className="absolute h-[2px] bg-gradient-to-r from-transparent via-[#4F8EF7] to-transparent pointer-events-none"
        animate={accentLine[sc]}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Persistent corner logo — fades in after hook */}
      <motion.div
        className="absolute top-8 left-10 z-50"
        animate={{ opacity: sc === 0 ? 0 : 0.7 }}
        transition={{ duration: 0.8 }}
      >
        <span className="text-white font-display font-bold text-[1.4vw] tracking-widest uppercase">Al Salik POS</span>
      </motion.div>

      {/* Scene-specific foreground content — key must be currentSceneKey for lock-loop */}
      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
