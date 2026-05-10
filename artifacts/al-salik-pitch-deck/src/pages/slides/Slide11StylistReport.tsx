const base = import.meta.env.BASE_URL;

export default function Slide11StylistReport() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0A0F1E" }}>
      <div className="absolute" style={{ top: 0, left: 0, width: "0.5vw", height: "100vh", background: "#4ECBA0" }} />

      <div className="absolute inset-0 flex" style={{ padding: "6vh 4vw 6vh 6vw" }}>
        <div style={{ flex: 1, paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.2vw", color: "#4ECBA0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.5vh" }}>
            Saloon Mode
          </div>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "3.8vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1.1, marginBottom: "4.5vh" }}>
            Stylist Revenue Report
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2.2vh" }}>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 500, color: "#E8EDF8" }}>Revenue per stylist for any date range</div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 500, color: "#E8EDF8" }}>Service count per stylist</div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 500, color: "#E8EDF8" }}>Compare performance across the team</div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 500, color: "#E8EDF8" }}>Available in Back Office — no extra setup needed</div>
            </div>
          </div>
        </div>

        <div style={{ width: "38vw", display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: "2vw" }}>
          <img
            src={`${base}analytics.png`}
            crossOrigin="anonymous"
            alt="Stylist analytics dashboard"
            style={{ width: "100%", borderRadius: "1vw", objectFit: "cover", height: "55vh", border: "1px solid rgba(78,203,160,0.2)" }}
          />
          <div style={{ display: "flex", gap: "2vw", marginTop: "2vh", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2.5vw", fontWeight: 900, color: "#4ECBA0" }}>AED 8,400</div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", color: "#8B9CC8" }}>Top stylist this month</div>
            </div>
            <div style={{ width: "1px", background: "rgba(139,156,200,0.2)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2.5vw", fontWeight: 900, color: "#4ECBA0" }}>247</div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", color: "#8B9CC8" }}>Services performed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
