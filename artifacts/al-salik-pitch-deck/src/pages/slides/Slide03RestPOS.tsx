const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide03RestPOS() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative" }}>
        <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Restaurant Mode</div>
        <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Point of Sale</h2>
        <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", maxWidth: "45vw", marginBottom: "4vh", lineHeight: 1.5 }}>
          A fast, intuitive checkout screen built for busy counters and high-volume service.
        </p>

        <div style={{ display: "flex", gap: "2vw", marginBottom: "3vh" }}>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "2.5vh 2vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payments</div>
            <div style={{ fontSize: "3vw", fontWeight: 700, color: "#FFFFFF", marginBottom: "0.8vh" }}>4 types</div>
            <div style={{ display: "inline-flex", alignItems: "center", padding: "0.3vh 0.8vw", backgroundColor: "rgba(20,184,166,0.1)", borderRadius: "1vw", color: "#14B8A6", fontSize: "0.9vw", fontWeight: 600 }}>Cash · Card · Credit · Split</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "2.5vh 2vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>UAE VAT</div>
            <div style={{ fontSize: "3vw", fontWeight: 700, color: "#FFFFFF", marginBottom: "0.8vh" }}>5%</div>
            <div style={{ display: "inline-flex", alignItems: "center", padding: "0.3vh 0.8vw", backgroundColor: "rgba(20,184,166,0.1)", borderRadius: "1vw", color: "#14B8A6", fontSize: "0.9vw", fontWeight: 600 }}>FTA Compliant</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "2.5vh 2vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Barcodes</div>
            <div style={{ fontSize: "3vw", fontWeight: 700, color: "#FFFFFF", marginBottom: "0.8vh" }}>6 types</div>
            <div style={{ display: "inline-flex", alignItems: "center", padding: "0.3vh 0.8vw", backgroundColor: "rgba(20,184,166,0.1)", borderRadius: "1vw", color: "#14B8A6", fontSize: "0.9vw", fontWeight: 600 }}>EAN, QR, Code128</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "2vw" }}>
          <div style={{ flex: 2, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "2.5vh 2.5vw", display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ fontSize: "1.2vw", fontWeight: 600, marginBottom: "0.5vh" }}>Core POS features</div>
            <div style={{ display: "flex", gap: "3vw" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Dine-in, takeaway, delivery</span>
                </div>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Held orders &amp; table management</span>
                </div>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Product modifier add-ons</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Loyalty points &amp; credit accounts</span>
                </div>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Staff PIN login with roles</span>
                </div>
                <div style={{ display: "flex", gap: "0.8vw", alignItems: "center" }}>
                  <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", flexShrink: 0 }} />
                  <span style={{ fontSize: "1.4vw", color: "#CBD5E1" }}>Refunds &amp; void management</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>03</div>
      </div>
    </div>
  );
}
