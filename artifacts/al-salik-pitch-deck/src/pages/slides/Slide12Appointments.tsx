const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide12Appointments() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative" }}>
        <div style={{ color: "#F59E0B", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Saloon Mode</div>
        <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Appointment Calendar</h2>
        <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", maxWidth: "50vw", marginBottom: "5vh", lineHeight: 1.5 }}>
          Book appointments and manage the daily schedule directly from the POS.
        </p>

        <div style={{ display: "flex", gap: "3vw", flex: 1 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.2vh" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Book by service, stylist &amp; time slot</div>
                  <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Duration auto-calculated from service settings</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Daily schedule view per stylist</div>
                  <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>See who is booked and when at a glance</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Convert booking to sale in one tap</div>
                  <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>No double entry — cart pre-filled from appointment</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Customer linked to every booking</div>
                  <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>History, loyalty &amp; credit all in one profile</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ width: "34vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "1vw", padding: "2.5vh 2.5vw" }}>
              <div style={{ color: "#F59E0B", fontSize: "1.1vw", fontWeight: 700, marginBottom: "2.5vh" }}>Today's Schedule</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
                <div style={{ display: "flex", gap: "1.5vw", alignItems: "center", backgroundColor: "rgba(245,158,11,0.08)", borderRadius: "0.5vw", padding: "1.2vh 1.5vw" }}>
                  <div style={{ fontSize: "1.2vw", color: "#F59E0B", fontWeight: 600, minWidth: "6vw" }}>10:00 AM</div>
                  <div>
                    <div style={{ fontSize: "1.3vw", fontWeight: 600 }}>Haircut · Ahmed</div>
                    <div style={{ fontSize: "1.1vw", color: "#94A3B8" }}>Mohammed Al Rashidi · 30 min</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1.5vw", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "0.5vw", padding: "1.2vh 1.5vw" }}>
                  <div style={{ fontSize: "1.2vw", color: "#94A3B8", minWidth: "6vw" }}>11:00 AM</div>
                  <div>
                    <div style={{ fontSize: "1.3vw", fontWeight: 600 }}>Facial · Sara</div>
                    <div style={{ fontSize: "1.1vw", color: "#94A3B8" }}>Fatima Hassan · 60 min</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "1.5vw", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "0.5vw", padding: "1.2vh 1.5vw" }}>
                  <div style={{ fontSize: "1.2vw", color: "#94A3B8", minWidth: "6vw" }}>12:30 PM</div>
                  <div>
                    <div style={{ fontSize: "1.3vw", fontWeight: 600 }}>VIP Package · Khalid</div>
                    <div style={{ fontSize: "1.1vw", color: "#94A3B8" }}>Walk-in · 90 min</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>12</div>
      </div>
    </div>
  );
}
