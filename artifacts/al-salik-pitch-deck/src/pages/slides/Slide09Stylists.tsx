const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide09Stylists() {
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
          <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Stylists &amp; Services</h2>
          <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "4vh", lineHeight: 1.5 }}>
            Every service assigned to a stylist. Every receipt shows who did the work.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "2.2vh" }}>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Services with duration in minutes</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>e.g. Haircut 30 min, Facial 60 min</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Stylist picker opens on every cart line</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Automatically prompts when adding a service</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Receipt prints stylist name per service</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Full transparency for customers</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Revenue &amp; count report per stylist</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Available in Back Office for any date range</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: "32vw", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2.5vw" }}>
            <div style={{ color: "#F59E0B", fontSize: "1.1vw", fontWeight: 700, marginBottom: "2vh" }}>Cart receipt — sample</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "0.5vw", padding: "1.5vh 1.5vw" }}>
                <div style={{ fontSize: "1.5vw", fontWeight: 600 }}>Haircut — AED 50</div>
                <div style={{ fontSize: "1.2vw", color: "#F59E0B", marginTop: "0.3vh" }}>Stylist: Ahmed</div>
              </div>
              <div style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "0.5vw", padding: "1.5vh 1.5vw" }}>
                <div style={{ fontSize: "1.5vw", fontWeight: 600 }}>Beard Trim — AED 30</div>
                <div style={{ fontSize: "1.2vw", color: "#F59E0B", marginTop: "0.3vh" }}>Stylist: Khalid</div>
              </div>
              <div style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "0.5vw", padding: "1.5vh 1.5vw" }}>
                <div style={{ fontSize: "1.5vw", fontWeight: 600 }}>Facial — AED 80</div>
                <div style={{ fontSize: "1.2vw", color: "#F59E0B", marginTop: "0.3vh" }}>Stylist: Sara</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>09</div>
      </div>
    </div>
  );
}
