export default function Slide08Stylists() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0A0F1E" }}>
      <div className="absolute" style={{ top: 0, left: 0, width: "0.5vw", height: "100vh", background: "#4ECBA0" }} />
      <div className="absolute" style={{ bottom: 0, right: 0, width: "40vw", height: "40vh", background: "radial-gradient(ellipse at bottom right, rgba(30,107,90,0.10) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "6vh 4vw 6vh 6vw" }}>
        <div style={{ flex: 1, paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.2vw", color: "#4ECBA0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.5vh" }}>
            Saloon Mode
          </div>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "3.8vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1.1, marginBottom: "4.5vh" }}>
            Stylists &amp; Services
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2.2vh" }}>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 700, color: "#FFFFFF" }}>Add any service and set duration in minutes</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.5vw", color: "#8B9CC8" }}>e.g. Haircut 30 min, Facial 60 min</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 700, color: "#FFFFFF" }}>Stylist picker on every cart line</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.5vw", color: "#8B9CC8" }}>Opens automatically when adding a service</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 700, color: "#FFFFFF" }}>Receipt prints stylist name per service</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.5vw", color: "#8B9CC8" }}>Every line item shows who performed it</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "2vw", fontWeight: 700, color: "#FFFFFF" }}>Full stylist performance report</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.5vw", color: "#8B9CC8" }}>Revenue &amp; service count per stylist</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: "32vw", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "2vh", paddingRight: "2vw" }}>
          <div style={{ background: "rgba(30,107,90,0.12)", border: "1px solid rgba(78,203,160,0.25)", borderRadius: "1vw", padding: "4vh 3vw", width: "100%", textAlign: "center" }}>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2vw", fontWeight: 700, color: "#4ECBA0", marginBottom: "2vh" }}>Cart receipt sample</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "0.5vw", padding: "1.5vh 1.5vw", textAlign: "left" }}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.5vw", fontWeight: 700, color: "#FFFFFF" }}>Haircut — AED 50</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", color: "#4ECBA0" }}>✂ Ahmed</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "0.5vw", padding: "1.5vh 1.5vw", textAlign: "left" }}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.5vw", fontWeight: 700, color: "#FFFFFF" }}>Beard Trim — AED 30</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", color: "#4ECBA0" }}>✂ Khalid</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
