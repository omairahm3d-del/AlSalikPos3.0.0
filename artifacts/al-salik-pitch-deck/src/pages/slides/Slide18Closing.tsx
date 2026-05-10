export default function Slide18Closing() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "4vw 4vh", pointerEvents: "none"
      }} />

      <div style={{ position: "absolute", width: "40vw", height: "40vw", backgroundColor: "#14B8A6", borderRadius: "50%", filter: "blur(14vw)", opacity: 0.08, zIndex: 1 }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", padding: "0.5vh 1vw", backgroundColor: "rgba(20,184,166,0.1)", border: "1px solid rgba(20,184,166,0.2)", borderRadius: "2vw", marginBottom: "4vh" }}>
          <span style={{ color: "#14B8A6", fontSize: "0.8vw", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Get Started</span>
        </div>

        <h1 style={{ fontSize: "5vw", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "2.5vh", lineHeight: 1.1 }}>
          Ready to go live?
        </h1>

        <p style={{ fontSize: "1.6vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", maxWidth: "42vw", marginBottom: "6vh", lineHeight: 1.6 }}>
          Al Salik POS is ready to activate today. Choose Restaurant or Saloon Mode and your first branch is live within hours.
        </p>

        <div style={{ width: "4vw", height: "0.4vh", backgroundColor: "#14B8A6", borderRadius: "0.2vh", marginBottom: "6vh" }} />

        <div style={{ display: "flex", gap: "5vw", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "4vh" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5vh" }}>
            <span style={{ color: "#94A3B8", fontSize: "0.9vw", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Inter', sans-serif" }}>Restaurant Mode</span>
            <span style={{ fontSize: "1.3vw", fontWeight: 600, color: "#14B8A6" }}>Available Now</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5vh" }}>
            <span style={{ color: "#94A3B8", fontSize: "0.9vw", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Inter', sans-serif" }}>Saloon Mode</span>
            <span style={{ fontSize: "1.3vw", fontWeight: 600, color: "#F59E0B" }}>Available Now</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5vh" }}>
            <span style={{ color: "#94A3B8", fontSize: "0.9vw", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Inter', sans-serif" }}>Multi-branch</span>
            <span style={{ fontSize: "1.3vw", fontWeight: 600 }}>Available Now</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS — Confidential</div>
      </div>
    </div>
  );
}
