import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);
  const [syncCount, setSyncCount] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2800),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 4) return;
    const id = setInterval(() => setSyncCount(n => n < 847 ? n + 23 : 847), 40);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: '-6vh' }}
      transition={{ duration: 0.7 }}
    >
      <div className="w-[80%] flex flex-col items-center">
        {/* Headline */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: -30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[5vw] font-bold text-white" style={{ fontFamily: '"Space Grotesk"' }}>
            Never Miss a Sale.
          </h2>
          <p className="text-[1.8vw] mt-3" style={{ fontFamily: 'Inter', color: 'rgba(255,255,255,0.55)' }}>
            Fully offline. Auto-syncs when you're back online.
          </p>
        </motion.div>

        {/* Split panels */}
        <div className="flex gap-6 w-full">
          {/* Offline panel */}
          <motion.div
            className="flex-1 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0, x: -40 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            {/* WiFi off icon */}
            <div className="flex items-center gap-3 mb-5">
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(231,76,60,0.2)', border: '1px solid rgba(231,76,60,0.4)' }}
                animate={phase >= 2 ? { rotate: [0, -5, 5, 0] } : {}}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                  <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <circle cx="12" cy="20" r="1" fill="#E74C3C" />
                </svg>
              </motion.div>
              <div>
                <div className="text-[1.1vw] font-semibold text-white" style={{ fontFamily: '"Space Grotesk"' }}>Offline Mode</div>
                <div className="text-[0.85vw]" style={{ color: '#E74C3C', fontFamily: 'Inter' }}>No internet connection</div>
              </div>
            </div>

            {/* Mini sales list */}
            {[{ t: '09:14', a: 'AED 68.00' }, { t: '09:31', a: 'AED 124.50' }, { t: '09:47', a: 'AED 37.00' }].map((s, i) => (
              <motion.div
                key={s.t}
                className="flex justify-between items-center py-2 border-b border-white/8"
                initial={{ opacity: 0, x: -12 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.1 + i * 0.12 }}
              >
                <span className="text-[1vw]" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter' }}>{s.t}</span>
                <span className="text-[1.1vw] font-semibold text-white" style={{ fontFamily: '"Space Grotesk"' }}>{s.a}</span>
                <span className="px-2 py-0.5 rounded text-[0.8vw]" style={{ background: 'rgba(255,165,0,0.15)', color: '#F4A925', fontFamily: 'Inter' }}>Queued</span>
              </motion.div>
            ))}

            <motion.p
              className="text-[0.95vw] mt-4"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter' }}
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : {}}
              transition={{ delay: 0.6 }}
            >
              All sales stored locally. Zero data lost.
            </motion.p>
          </motion.div>

          {/* Arrow */}
          <motion.div
            className="flex items-center"
            initial={{ opacity: 0, scale: 0 }}
            animate={phase >= 3 ? { opacity: 1, scale: 1 } : {}}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.5 }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </motion.div>

          {/* Online / synced panel */}
          <motion.div
            className="flex-1 rounded-2xl p-6"
            style={{ background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.25)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0, x: 40 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
            transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(46,204,113,0.2)', border: '1px solid rgba(46,204,113,0.4)' }}
                animate={phase >= 4 ? { rotate: 360 } : {}}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ECC71" strokeWidth="2" strokeLinecap="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </motion.div>
              <div>
                <div className="text-[1.1vw] font-semibold text-white" style={{ fontFamily: '"Space Grotesk"' }}>Cloud Sync</div>
                <div className="text-[0.85vw]" style={{ color: '#2ECC71', fontFamily: 'Inter' }}>Back online — syncing…</div>
              </div>
            </div>

            {/* Sync counter */}
            <motion.div
              className="text-center py-6"
              initial={{ opacity: 0 }}
              animate={phase >= 4 ? { opacity: 1 } : {}}
              transition={{ duration: 0.4 }}
            >
              <div className="text-[4vw] font-bold" style={{ color: '#4F8EF7', fontFamily: '"Space Grotesk"' }}>
                {syncCount}
              </div>
              <div className="text-[1vw] mt-1" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter' }}>records synced</div>
            </motion.div>

            <motion.div
              className="flex items-center gap-2 justify-center"
              initial={{ opacity: 0 }}
              animate={phase >= 4 ? { opacity: 1 } : {}}
              transition={{ delay: 0.4 }}
            >
              <motion.div
                className="w-2 h-2 rounded-full bg-[#2ECC71]"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-[0.95vw]" style={{ color: '#2ECC71', fontFamily: 'Inter' }}>All data secure on cloud</span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
