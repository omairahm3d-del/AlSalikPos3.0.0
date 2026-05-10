const dotBg = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "2vw 2vw",
} as const;

export default function Slide05RestReports() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column", padding: "8vh 8vw", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, ...dotBg, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ marginBottom: "5vh" }}>
          <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Restaurant Mode</div>
          <h1 style={{ fontSize: "3.5vw", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Reports &amp; Business Insights</h1>
        </div>

        <div style={{ display: "flex", gap: "2vw", marginBottom: "3vh" }}>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh", fontWeight: 500 }}>Daily Sales</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "1vw", marginBottom: "0.8vh" }}>
              <div style={{ fontSize: "3.5vw", fontWeight: 700, lineHeight: 1 }}>Z</div>
              <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 600 }}>Report</div>
            </div>
            <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", opacity: 0.8 }}>End-of-day summary, one tap</div>
          </div>

          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh", fontWeight: 500 }}>Revenue Breakdown</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "1vw", marginBottom: "0.8vh" }}>
              <div style={{ fontSize: "3.5vw", fontWeight: 700, lineHeight: 1 }}>By</div>
              <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 600 }}>Category &amp; Product</div>
            </div>
            <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", opacity: 0.8 }}>See exactly what sells</div>
          </div>

          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh", fontWeight: 500 }}>Export</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "1vw", marginBottom: "0.8vh" }}>
              <div style={{ fontSize: "3.5vw", fontWeight: 700, lineHeight: 1 }}>CSV</div>
              <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 600 }}>Any range</div>
            </div>
            <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", opacity: 0.8 }}>Accountant-ready in one click</div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", marginBottom: "2vh", fontWeight: 500 }}>Monthly Revenue — Sample Trend</div>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "1vw", display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "3vh 4vw", boxSizing: "border-box", position: "relative" }}>
            <div style={{ position: "absolute", top: "25%", left: 0, right: 0, height: "1px", backgroundColor: "rgba(255,255,255,0.03)" }} />
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "1px", backgroundColor: "rgba(255,255,255,0.03)" }} />
            <div style={{ position: "absolute", top: "75%", left: 0, right: 0, height: "1px", backgroundColor: "rgba(255,255,255,0.03)" }} />
            <div style={{ width: "3vw", height: "30%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.5 }} />
            <div style={{ width: "3vw", height: "45%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.55 }} />
            <div style={{ width: "3vw", height: "40%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.55 }} />
            <div style={{ width: "3vw", height: "60%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.6 }} />
            <div style={{ width: "3vw", height: "55%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.6 }} />
            <div style={{ width: "3vw", height: "75%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.65 }} />
            <div style={{ width: "3vw", height: "70%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.7 }} />
            <div style={{ width: "3vw", height: "85%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.8 }} />
            <div style={{ width: "3vw", height: "80%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.85 }} />
            <div style={{ width: "3vw", height: "95%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.9 }} />
            <div style={{ width: "3vw", height: "90%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 0.95 }} />
            <div style={{ width: "3vw", height: "100%", backgroundColor: "#14B8A6", borderRadius: "0.3vw 0.3vw 0 0", opacity: 1 }} />
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "8vw", right: "8vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>05</div>
      </div>
    </div>
  );
}
