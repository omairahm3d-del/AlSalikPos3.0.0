import { useState, useEffect } from 'react';

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const scenes = Object.keys(durations);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let hasCompletedFirstPass = false;

    const playScene = (index: number) => {
      setCurrentScene(index);
      const duration = durations[scenes[index]];

      if (index === 0 && !hasCompletedFirstPass) {
        window.startRecording?.();
      }

      timeoutId = setTimeout(() => {
        const nextScene = index + 1;
        if (nextScene >= scenes.length) {
          if (!hasCompletedFirstPass) {
            window.stopRecording?.();
            hasCompletedFirstPass = true;
          }
          playScene(0); // loop
        } else {
          playScene(nextScene);
        }
      }, duration);
    };

    playScene(0);

    return () => clearTimeout(timeoutId);
  }, []);

  return { currentScene };
}
