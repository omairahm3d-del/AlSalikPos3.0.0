const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide11Packages() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative", gap: "4vw" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ color: "#F59E0B", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Saloon Mode</div>
          <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Prepaid Packages</h2>
          <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "4vh", lineHeight: 1.5 }}>
            Sell session credits upfront. Customers pay once and redeem visits over time.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "2.2vh" }}>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Define session count &amp; allowed services</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Restrict to specific services or leave open</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Customer balance tracked automatically</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Remaining sessions shown on every receipt</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Guaranteed recurring revenue</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Customers return because they've already paid</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: "32vw", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "1vw", padding: "3.5vh 3vw", textAlign: "center" }}>
            <div style={{ color: "#F59E0B", fontSize: "1.2vw", fontWeight: 700, marginBottom: "2vh" }}>Example package</div>
            <div style={{ fontSize: "2vw", fontWeight: 700, marginBottom: "0.8vh" }}>10 Haircuts</div>
            <div style={{ fontSize: "3.5vw", fontWeight: 700, color: "#F59E0B", marginBottom: "0.8vh" }}>AED 400</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "2.5vh" }}>Save AED 100 vs individual pricing</div>
            <div style={{ display: "flex", gap: "0.8vw", flexWrap: "wrap", justifyContent: "center", marginBottom: "2vh" }}>
              <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "50%", backgroundColor: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "1.1vw", fontWeight: 700, color: "#0F172A" }}>1</span>
              </div>
              <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "50%", backgroundColor: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "1.1vw", fontWeight: 700, color: "#0F172A" }}>2</span>
              </div>
              <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "50%", backgroundColor: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "1.1vw", fontWeight: 700, color: "#0F172A" }}>3</span>
              </div>
              <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "1.1vw", color: "#F59E0B" }}>4</span>
              </div>
              <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "1.1vw", color: "#F59E0B" }}>5</span>
              </div>
            </div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>3 used · 7 remaining</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>11</div>
      </div>
    </div>
  );
}
