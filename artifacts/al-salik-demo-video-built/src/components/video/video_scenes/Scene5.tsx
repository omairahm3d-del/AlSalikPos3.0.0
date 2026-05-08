import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const platforms = ['📱 iOS', '🤖 Android', '💻 Windows', '🌐 Web'];

const closingStats = [
  { n: '5%', label: 'UAE VAT Auto-Calculated' },
  { n: 'AED', label: 'Currency Throughout' },
  { n: '∞', label: 'Offline Sales Capacity' },
];

const tagletters = 'Sell Smarter. Everywhere.'.split('');

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2400),
      setTimeout(() => setPhase(4), 4000),
      setTimeout(() => setPhase(5), 5500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(12px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Gold divider line */}
      <motion.div
        className="h-[2px] bg-gradient-to-r from-transparent via-[#F4A925] to-transparent mb-8"
        initial={{ width: 0, opacity: 0 }}
        animate={phase >= 1 ? { width: '30vw', opacity: 1 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Main title */}
      <motion.h1
        className="text-[8vw] font-bold tracking-tight text-white"
        style={{ fontFamily: '"Space Grotesk"' }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        Al Salik POS
      </motion.h1>

      {/* Tagline — per-character */}
      <div className="flex mt-4 overflow-hidden">
        {tagletters.map((ch, i) => (
          <motion.span
            key={i}
            className={`text-[2.5vw] font-medium ${ch === ' ' ? 'w-[1vw]' : ''}`}
            style={{ fontFamily: '"Space Grotesk"', color: '#F4A925', display: 'inline-block' }}
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: phase >= 2 ? i * 0.025 : 0, type: 'spring', stiffness: 350, damping: 28 }}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </motion.span>
        ))}
      </div>

      {/* Platform badges */}
      <motion.div
        className="flex gap-4 mt-10"
        initial={{ opacity: 0, y: 16 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        {platforms.map((p, i) => (
          <motion.div
            key={p}
            className="px-4 py-2 rounded-xl text-[1.1vw] font-medium text-white"
            style={{ background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.3)', fontFamily: 'Inter' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={phase >= 3 ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 22 }}
          >
            {p}
          </motion.div>
        ))}
      </motion.div>

      {/* Closing stat row */}
      <motion.div
        className="flex gap-12 mt-12"
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
        transition={{ duration: 0.7 }}
      >
        {closingStats.map((s, i) => (
          <motion.div
            key={s.label}
            className="text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 4 ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.15 }}
          >
            <div className="text-[3vw] font-bold" style={{ color: '#4F8EF7', fontFamily: '"Space Grotesk"' }}>{s.n}</div>
            <div className="text-[0.95vw] mt-1" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter' }}>{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Final blue divider */}
      <motion.div
        className="h-[1px] bg-gradient-to-r from-transparent via-[#4F8EF7] to-transparent mt-10"
        initial={{ width: 0, opacity: 0 }}
        animate={phase >= 5 ? { width: '40vw', opacity: 0.6 } : {}}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.div>
  );
}
