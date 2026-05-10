export default function Slide10Packages() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0A0F1E" }}>
      <div className="absolute" style={{ top: 0, left: 0, width: "0.5vw", height: "100vh", background: "#4ECBA0" }} />
      <div className="absolute" style={{ top: 0, right: 0, width: "35vw", height: "100vh", background: "rgba(26,34,64,0.45)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "6vh 4vw 6vh 6vw" }}>
        <div style={{ flex: 1, paddingRight: "3vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.2vw", color: "#4ECBA0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.5vh" }}>
            Saloon Mode
          </div>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "3.8vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1.1, marginBottom: "1.5vh" }}>
            Prepaid Packages
          </div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#8B9CC8", marginBottom: "4vh", lineHeight: 1.5 }}>
            Sell session credits upfront — customers pay once, redeem over time
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.9vw", fontWeight: 700, color: "#FFFFFF" }}>Define how many sessions are included</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.4vw", color: "#8B9CC8" }}>Optionally restrict to specific services</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.9vw", fontWeight: 700, color: "#FFFFFF" }}>Customer balance tracked automatically</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.4vw", color: "#8B9CC8" }}>Redemptions shown on every receipt</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.9vw", fontWeight: 700, color: "#FFFFFF" }}>Keeps customers coming back</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.4vw", color: "#8B9CC8" }}>Guaranteed recurring revenue from day one</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: "31vw", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "2vh", paddingRight: "2vw" }}>
          <div style={{ background: "rgba(30,107,90,0.12)", border: "1px solid rgba(78,203,160,0.25)", borderRadius: "1vw", padding: "4vh 3vw", width: "100%", textAlign: "center" }}>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.5vw", color: "#4ECBA0", marginBottom: "2vh" }}>Example package</div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2.2vw", fontWeight: 700, color: "#FFFFFF", marginBottom: "1vh" }}>10 Haircuts</div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "3.5vw", fontWeight: 900, color: "#4ECBA0", marginBottom: "1vh" }}>AED 400</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.4vw", color: "#8B9CC8" }}>Save AED 100 vs individual pricing</div>
            <div style={{ marginTop: "2.5vh", display: "flex", gap: "0.5vw", flexWrap: "wrap", justifyContent: "center" }}>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "50%", background: "#4ECBA0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.1vw", fontWeight: 700, color: "#0A0F1E" }}>1</span>
              </div>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "50%", background: "#4ECBA0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.1vw", fontWeight: 700, color: "#0A0F1E" }}>2</span>
              </div>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "50%", background: "#4ECBA0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.1vw", fontWeight: 700, color: "#0A0F1E" }}>3</span>
              </div>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "50%", background: "#1A2240", border: "1px solid rgba(78,203,160,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.1vw", color: "#4ECBA0" }}>4</span>
              </div>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "50%", background: "#1A2240", border: "1px solid rgba(78,203,160,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.1vw", color: "#4ECBA0" }}>5</span>
              </div>
            </div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", color: "#8B9CC8", marginTop: "1.5vh" }}>3 sessions used · 7 remaining</div>
          </div>
        </div>
      </div>
    </div>
  );
}
