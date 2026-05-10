const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide04RestStock() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative" }}>
        <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Restaurant Mode</div>
        <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Inventory &amp; Stock</h2>
        <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", maxWidth: "45vw", marginBottom: "5vh", lineHeight: 1.5 }}>
          Real-time stock tracking from the moment goods are received to the moment they're sold.
        </p>

        <div style={{ display: "flex", gap: "2vw", marginBottom: "3vh" }}>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Live stock levels</div>
            <div style={{ fontSize: "2.5vw", fontWeight: 700, marginBottom: "0.8vh" }}>Real-time</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Updated on every sale automatically</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Low-stock alerts</div>
            <div style={{ fontSize: "2.5vw", fontWeight: 700, marginBottom: "0.8vh" }}>Proactive</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Notified before you run out</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>GRN purchasing</div>
            <div style={{ fontSize: "2.5vw", fontWeight: 700, marginBottom: "0.8vh" }}>Supplier</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>VAT per line on every goods receipt</div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", gap: "2vw" }}>
          <div style={{ flex: 3, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "2.5vh 2.5vw", display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ fontSize: "1.2vw", fontWeight: 600, marginBottom: "0.5vh" }}>Additional stock capabilities</div>
            <div style={{ display: "flex", gap: "4vw" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Weight-based selling (price per kg)</span>
                </div>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Manual stock adjustments with reason</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Full movement history (purchase/sale/adjust)</span>
                </div>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Supplier statements with CSV export</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>04</div>
      </div>
    </div>
  );
}
