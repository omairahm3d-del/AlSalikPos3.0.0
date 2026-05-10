const dotBg = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "2vw 2vw",
} as const;

export default function Slide02Modes() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column", padding: "8vh 8vw", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, ...dotBg, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ marginBottom: "5vh" }}>
          <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Choose Your Mode</div>
          <h1 style={{ fontSize: "3.5vw", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Which Mode Is Right for You?</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3vw", flex: 1 }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "4vh 3vw", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.6vw", marginBottom: "2.5vh" }}>
              <div style={{ width: "0.7vw", height: "0.7vw", borderRadius: "50%", backgroundColor: "#14B8A6" }} />
              <span style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Restaurant Mode</span>
            </div>
            <p style={{ color: "#94A3B8", fontSize: "1.3vw", fontFamily: "'Inter', sans-serif", marginBottom: "3vh", lineHeight: 1.5 }}>For cafes, restaurants &amp; retail stores</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.8vh" }}>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Products, barcodes &amp; category grid</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Cash · Card · Split payments</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>5% UAE VAT built in</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Inventory &amp; supplier purchasing</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Multi-branch &amp; offline-first</span>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "4vh 3vw", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#F59E0B" }} />
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.6vw", marginBottom: "2.5vh" }}>
              <div style={{ width: "0.7vw", height: "0.7vw", borderRadius: "50%", backgroundColor: "#F59E0B" }} />
              <span style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Saloon Mode</span>
            </div>
            <p style={{ color: "#94A3B8", fontSize: "1.3vw", fontFamily: "'Inter', sans-serif", marginBottom: "3vh", lineHeight: 1.5 }}>Everything in Restaurant, plus salon features</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.8vh" }}>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#F59E0B", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Services with duration per appointment</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#F59E0B", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Stylist assignment per cart line</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#F59E0B", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Service bundles at one price</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#F59E0B", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Prepaid packages &amp; session credits</span>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#F59E0B", flexShrink: 0 }} />
                <span style={{ fontSize: "1.6vw", color: "#E2E8F0" }}>Appointment calendar for booking</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "8vw", right: "8vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>02</div>
      </div>
    </div>
  );
}
