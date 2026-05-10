const dotBg = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "2vw 2vw",
} as const;

export default function Slide17WhySalik() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column", padding: "8vh 8vw", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, ...dotBg, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ marginBottom: "5vh" }}>
          <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Why Al Salik</div>
          <h1 style={{ fontSize: "3.5vw", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Six Reasons to Choose Al Salik POS</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2.5vw", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
            <div style={{ width: "3vw", height: "0.4vh", backgroundColor: "#14B8A6", borderRadius: "0.2vh" }} />
            <div style={{ fontSize: "1.2vw", color: "#14B8A6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Offline-first</div>
            <div style={{ fontSize: "1.5vw", color: "#E2E8F0", lineHeight: 1.5 }}>Works without internet. No internet, no problem — sales never stop.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
            <div style={{ width: "3vw", height: "0.4vh", backgroundColor: "#14B8A6", borderRadius: "0.2vh" }} />
            <div style={{ fontSize: "1.2vw", color: "#14B8A6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>UAE VAT compliant</div>
            <div style={{ fontSize: "1.5vw", color: "#E2E8F0", lineHeight: 1.5 }}>5% VAT, FTA-compliant simplified tax invoices, TRN on every receipt.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
            <div style={{ width: "3vw", height: "0.4vh", backgroundColor: "#14B8A6", borderRadius: "0.2vh" }} />
            <div style={{ fontSize: "1.2vw", color: "#14B8A6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Multi-branch</div>
            <div style={{ fontSize: "1.5vw", color: "#E2E8F0", lineHeight: 1.5 }}>One system for all your locations. Each branch isolated, one dashboard.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
            <div style={{ width: "3vw", height: "0.4vh", backgroundColor: "#F59E0B", borderRadius: "0.2vh" }} />
            <div style={{ fontSize: "1.2vw", color: "#F59E0B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Two modes</div>
            <div style={{ fontSize: "1.5vw", color: "#E2E8F0", lineHeight: 1.5 }}>Restaurant and Saloon — one platform, purpose-built for both.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
            <div style={{ width: "3vw", height: "0.4vh", backgroundColor: "#F59E0B", borderRadius: "0.2vh" }} />
            <div style={{ fontSize: "1.2vw", color: "#F59E0B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>No per-transaction fees</div>
            <div style={{ fontSize: "1.5vw", color: "#E2E8F0", lineHeight: 1.5 }}>Flat license pricing. Keep your margins on every sale.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
            <div style={{ width: "3vw", height: "0.4vh", backgroundColor: "#F59E0B", borderRadius: "0.2vh" }} />
            <div style={{ fontSize: "1.2vw", color: "#F59E0B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ready same day</div>
            <div style={{ fontSize: "1.5vw", color: "#E2E8F0", lineHeight: 1.5 }}>Simple setup, no complex onboarding. Live within hours of activation.</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "8vw", right: "8vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>17</div>
      </div>
    </div>
  );
}
