export default function Slide09Bundles() {
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
            Service Bundles
          </div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#8B9CC8", marginBottom: "4vh", lineHeight: 1.5 }}>
            Group multiple services into one package at a fixed combined price
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.8vh" }}>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.9vw", fontWeight: 500, color: "#E8EDF8" }}>Bundle shown as one cart line — clean, fast checkout</div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.9vw", fontWeight: 500, color: "#E8EDF8" }}>Individual services listed on the receipt</div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%", marginTop: "1.1vh", flexShrink: 0 }} />
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.9vw", fontWeight: 500, color: "#E8EDF8" }}>Great for upselling &amp; increasing average ticket</div>
            </div>
          </div>
        </div>

        <div style={{ width: "31vw", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh", paddingRight: "2vw" }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", color: "#4ECBA0", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1vh" }}>Examples</div>
          <div style={{ background: "rgba(30,107,90,0.15)", border: "1px solid rgba(78,203,160,0.3)", borderRadius: "1vw", padding: "3vh 2.5vw" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.6vw", fontWeight: 700, color: "#4ECBA0", marginBottom: "1.2vh" }}>VIP Package</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.4vw", color: "#CBD5E8", marginBottom: "0.5vh" }}>Haircut + Beard + Facial</div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2.5vw", fontWeight: 700, color: "#FFFFFF" }}>AED 200</div>
          </div>
          <div style={{ background: "rgba(30,107,90,0.15)", border: "1px solid rgba(78,203,160,0.3)", borderRadius: "1vw", padding: "3vh 2.5vw" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.6vw", fontWeight: 700, color: "#4ECBA0", marginBottom: "1.2vh" }}>Bridal Package</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.4vw", color: "#CBD5E8", marginBottom: "0.5vh" }}>Hair + Makeup + Nails</div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2.5vw", fontWeight: 700, color: "#FFFFFF" }}>AED 450</div>
          </div>
        </div>
      </div>
    </div>
  );
}
