import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const stats = [
  { label: 'Today\'s Sales', val: 'AED 12,480', color: '#4F8EF7', change: '+18%' },
  { label: 'Items Sold', val: '347', color: '#2ECC71', change: '+24' },
  { label: 'VAT Collected', val: 'AED 594', color: '#F4A925', change: '5%' },
];

const branches = ['Dubai Mall', 'Abu Dhabi', 'Sharjah', 'Al Ain'];

const features = [
  { icon: '🏢', label: 'Multi-Branch', sub: '4 locations, 1 account' },
  { icon: '📊', label: 'Live Reports', sub: 'Z-reports & CSV export' },
  { icon: '👥', label: 'Staff Roles', sub: 'PIN login + permissions' },
  { icon: '📦', label: 'Stock Control', sub: 'Real-time inventory' },
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 4000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, clipPath: 'circle(0% at 80% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 80% 50%)' }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[88%]">
        {/* Title */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-[4.5vw] font-bold text-white" style={{ fontFamily: '"Space Grotesk"' }}>
            Complete <span style={{ color: '#4F8EF7' }}>Control</span>
          </h2>
          <p className="text-[1.5vw] mt-2" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter' }}>
            One dashboard. Every branch. Full visibility.
          </p>
        </motion.div>

        <div className="flex gap-6">
          {/* Left: stats + branch list */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Stats */}
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                className="flex items-center justify-between px-5 py-4 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${s.color}30` }}
                initial={{ opacity: 0, x: -30 }}
                animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.15, type: 'spring', stiffness: 280, damping: 24 }}
              >
                <div>
                  <div className="text-[0.9vw] mb-1" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter' }}>{s.label}</div>
                  <div className="text-[1.8vw] font-bold text-white" style={{ fontFamily: '"Space Grotesk"' }}>{s.val}</div>
                </div>
                <div className="px-3 py-1 rounded-full text-[0.85vw] font-semibold"
                  style={{ background: `${s.color}20`, color: s.color, fontFamily: 'Inter' }}>
                  {s.change}
                </div>
              </motion.div>
            ))}

            {/* Branch pills */}
            <motion.div
              className="mt-2"
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : {}}
              transition={{ duration: 0.5 }}
            >
              <div className="text-[0.9vw] mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter', letterSpacing: '0.1em' }}>ACTIVE BRANCHES</div>
              <div className="flex flex-wrap gap-2">
                {branches.map((b, i) => (
                  <motion.span
                    key={b}
                    className="px-3 py-1 rounded-lg text-[0.95vw] font-medium text-white"
                    style={{ background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.3)', fontFamily: 'Inter' }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={phase >= 3 ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: 0.1 + i * 0.1, type: 'spring', stiffness: 300, damping: 22 }}
                  >
                    📍 {b}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right: feature grid */}
          <div className="flex-shrink-0 w-[38%] grid grid-cols-2 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                className="p-5 rounded-2xl flex flex-col gap-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={phase >= 4 ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ delay: i * 0.12, type: 'spring', stiffness: 260, damping: 22 }}
              >
                <span className="text-[2vw]">{f.icon}</span>
                <div className="text-[1.1vw] font-semibold text-white" style={{ fontFamily: '"Space Grotesk"' }}>{f.label}</div>
                <div className="text-[0.85vw]" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter' }}>{f.sub}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
