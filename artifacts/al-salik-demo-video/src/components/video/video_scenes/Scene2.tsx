import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const cartItems = [
  { name: 'Cappuccino', price: 'AED 18.00', qty: 2, color: '#4F8EF7' },
  { name: 'Club Sandwich', price: 'AED 42.00', qty: 1, color: '#F4A925' },
  { name: 'Mineral Water', price: 'AED 8.00', qty: 3, color: '#2ECC71' },
];

const payMethods = ['💳 Card', '💵 Cash', '🔄 Split'];

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 2800),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 7000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
      animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
      exit={{ opacity: 0, x: '-8vw' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[85%] flex gap-8 items-start">
        {/* Left: section label */}
        <div className="flex-shrink-0 w-[28%]">
          <motion.div
            className="h-[3px] w-0 bg-[#4F8EF7] mb-6"
            animate={phase >= 1 ? { width: '100%' } : {}}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.h2
            className="text-[3.8vw] font-bold leading-tight"
            style={{ fontFamily: '"Space Grotesk"', color: '#fff' }}
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Fast<br /><span style={{ color: '#4F8EF7' }}>Checkout</span>
          </motion.h2>
          <motion.p
            className="text-[1.2vw] mt-4 leading-relaxed"
            style={{ fontFamily: 'Inter', color: 'rgba(255,255,255,0.55)' }}
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : {}}
            transition={{ duration: 0.5 }}
          >
            Scan barcode → add items → collect payment in seconds.
          </motion.p>

          {/* Payment method pills */}
          <div className="flex flex-col gap-2 mt-8">
            {payMethods.map((m, i) => (
              <motion.div
                key={m}
                className="px-4 py-2 rounded-lg text-[1.1vw] font-medium"
                style={{ background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.3)', color: '#fff', fontFamily: 'Inter' }}
                initial={{ opacity: 0, x: -20 }}
                animate={phase >= 4 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.12, type: 'spring', stiffness: 300, damping: 24 }}
              >
                {m}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: POS receipt card */}
        <motion.div
          className="flex-1 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(16px)' }}
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          {/* Card header */}
          <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
            <span className="text-[1.1vw] font-semibold text-white/70" style={{ fontFamily: 'Inter' }}>Order #1042</span>
            <span className="px-3 py-1 rounded-full text-[0.9vw] font-medium" style={{ background: 'rgba(46,204,113,0.15)', color: '#2ECC71', fontFamily: 'Inter' }}>Dine-in</span>
          </div>

          {/* Items */}
          <div className="px-6 py-4 flex flex-col gap-3">
            {cartItems.map((item, i) => (
              <motion.div
                key={item.name}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: 20 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.18, type: 'spring', stiffness: 320, damping: 26 }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[1vw] font-bold text-white"
                  style={{ background: item.color }}>
                  {item.qty}
                </div>
                <span className="flex-1 text-[1.2vw] text-white" style={{ fontFamily: 'Inter' }}>{item.name}</span>
                <span className="text-[1.1vw] font-semibold" style={{ color: item.color, fontFamily: '"Space Grotesk"' }}>{item.price}</span>
              </motion.div>
            ))}
          </div>

          {/* Total */}
          <motion.div
            className="mx-6 mb-6 px-5 py-4 rounded-xl flex justify-between items-center"
            style={{ background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.3)' }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1 } : {}}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          >
            <div>
              <div className="text-[0.9vw] text-white/50 mb-1" style={{ fontFamily: 'Inter' }}>Total incl. 5% VAT</div>
              <div className="text-[2.2vw] font-bold text-white" style={{ fontFamily: '"Space Grotesk"' }}>AED 102.90</div>
            </div>
            <motion.div
              className="px-5 py-3 rounded-xl text-[1.1vw] font-bold text-white"
              style={{ background: '#4F8EF7', fontFamily: 'Inter' }}
              animate={phase >= 5 ? { scale: [1, 1.06, 1] } : {}}
              transition={{ duration: 0.4 }}
            >
              {phase >= 5 ? '✓ Paid' : 'Collect'}
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
