import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const letters = 'AL SALIK POS'.split('');

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 3200),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.6 }}
    >
      {/* Gold horizontal rule draws in */}
      <motion.div
        className="h-[2px] bg-gradient-to-r from-[#F4A925] via-[#F4A925] to-transparent mb-10"
        initial={{ width: 0, opacity: 0 }}
        animate={phase >= 1 ? { width: '28vw', opacity: 1 } : {}}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Per-character title */}
      <h1 className="flex overflow-hidden" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
        {letters.map((ch, i) => (
          <motion.span
            key={i}
            className={`text-[7.5vw] font-bold tracking-tight leading-none ${ch === ' ' ? 'w-[3vw]' : 'text-white'}`}
            initial={{ opacity: 0, y: 60, rotateX: -45 }}
            animate={phase >= 1 ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ type: 'spring', stiffness: 380, damping: 28, delay: phase >= 1 ? i * 0.04 : 0 }}
            style={{ display: 'inline-block', perspective: '400px' }}
          >
            {ch}
          </motion.span>
        ))}
      </h1>

      {/* Tagline */}
      <motion.p
        className="text-[2.2vw] mt-6 tracking-[0.25em] uppercase"
        style={{ fontFamily: 'Inter, sans-serif', color: '#F4A925' }}
        initial={{ opacity: 0, filter: 'blur(12px)' }}
        animate={phase >= 2 ? { opacity: 1, filter: 'blur(0px)' } : {}}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        Built for UAE Business
      </motion.p>

      {/* Feature pills stagger in */}
      <motion.div
        className="flex gap-4 mt-10"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        {['Mobile-First POS', 'UAE VAT Ready', 'Multi-Branch', 'Offline-First'].map((tag, i) => (
          <motion.span
            key={tag}
            className="px-4 py-2 rounded-full text-[1.1vw] font-medium border border-[#4F8EF7]/50 text-[#4F8EF7]"
            style={{ background: 'rgba(79,142,247,0.1)', fontFamily: 'Inter, sans-serif' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={phase >= 3 ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 22 }}
          >
            {tag}
          </motion.span>
        ))}
      </motion.div>

      {/* Subtle badge: AED currency */}
      <motion.div
        className="absolute bottom-[18%] right-[12%] flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={phase >= 4 ? { opacity: 1, scale: 1 } : {}}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <span className="text-[2.8vw] font-bold text-[#F4A925]" style={{ fontFamily: '"Space Grotesk"' }}>AED</span>
        <span className="text-[0.9vw] text-white/50 tracking-widest uppercase mt-1">Currency</span>
      </motion.div>
    </motion.div>
  );
}
