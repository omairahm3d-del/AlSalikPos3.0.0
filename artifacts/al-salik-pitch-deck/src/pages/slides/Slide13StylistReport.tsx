const base = import.meta.env.BASE_URL;

const dotBg = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "2vw 2vw",
} as const;

export default function Slide13StylistReport() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column", padding: "8vh 8vw", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, ...dotBg, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ marginBottom: "4vh" }}>
          <div style={{ color: "#F59E0B", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Saloon Mode</div>
          <h1 style={{ fontSize: "3.5vw", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Stylist Revenue Report</h1>
        </div>

        <div style={{ display: "flex", gap: "3vw", flex: 1 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            <div style={{ display: "flex", gap: "2vw", marginBottom: "3vh" }}>
              <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
                <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1vh" }}>Top Stylist</div>
                <div style={{ fontSize: "3vw", fontWeight: 700, color: "#F59E0B" }}>AED 8,400</div>
                <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", marginTop: "0.5vh" }}>Ahmed — this month</div>
              </div>
              <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
                <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1vh" }}>Total services</div>
                <div style={{ fontSize: "3vw", fontWeight: 700 }}>247</div>
                <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", marginTop: "0.5vh" }}>Across all stylists</div>
              </div>
            </div>

            <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "1vw", padding: "2.5vh 2.5vw" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 600, marginBottom: "3vh" }}>Revenue per stylist — this month</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2.2vh" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2vw", marginBottom: "0.8vh" }}>
                    <span>Ahmed</span><span style={{ color: "#F59E0B" }}>AED 8,400</span>
                  </div>
                  <div style={{ width: "100%", height: "0.7vh", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "0.35vh" }}>
                    <div style={{ width: "100%", height: "100%", backgroundColor: "#F59E0B", borderRadius: "0.35vh" }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2vw", marginBottom: "0.8vh" }}>
                    <span>Sara</span><span style={{ color: "#F59E0B" }}>AED 6,200</span>
                  </div>
                  <div style={{ width: "100%", height: "0.7vh", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "0.35vh" }}>
                    <div style={{ width: "74%", height: "100%", backgroundColor: "#F59E0B", borderRadius: "0.35vh", opacity: 0.75 }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2vw", marginBottom: "0.8vh" }}>
                    <span>Khalid</span><span style={{ color: "#F59E0B" }}>AED 5,100</span>
                  </div>
                  <div style={{ width: "100%", height: "0.7vh", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "0.35vh" }}>
                    <div style={{ width: "61%", height: "100%", backgroundColor: "#F59E0B", borderRadius: "0.35vh", opacity: 0.6 }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2vw", marginBottom: "0.8vh" }}>
                    <span>Layla</span><span style={{ color: "#F59E0B" }}>AED 3,800</span>
                  </div>
                  <div style={{ width: "100%", height: "0.7vh", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "0.35vh" }}>
                    <div style={{ width: "45%", height: "100%", backgroundColor: "#F59E0B", borderRadius: "0.35vh", opacity: 0.5 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ width: "36vw" }}>
            <img
              src={`${base}analytics.png`}
              crossOrigin="anonymous"
              alt="Analytics dashboard"
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "1vw", border: "1px solid rgba(245,158,11,0.15)" }}
            />
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "8vw", right: "8vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>13</div>
      </div>
    </div>
  );
}
