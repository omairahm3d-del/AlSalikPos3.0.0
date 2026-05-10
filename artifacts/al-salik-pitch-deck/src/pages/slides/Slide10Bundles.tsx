const dotBg = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "2vw 2vw",
} as const;

export default function Slide10Bundles() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column", padding: "8vh 8vw", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, ...dotBg, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ marginBottom: "4vh" }}>
          <div style={{ color: "#F59E0B", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Saloon Mode</div>
          <h1 style={{ fontSize: "3.5vw", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Service Bundles</h1>
          <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginTop: "1.5vh", lineHeight: 1.5, maxWidth: "50vw" }}>
            Group multiple services into one package at a fixed combined price. Boost average ticket, simplify checkout.
          </p>
        </div>

        <div style={{ display: "flex", gap: "3vw", flex: 1 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5vh' }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2vh", marginBottom: "3vh" }}>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div style={{ fontSize: "1.7vw", color: "#E2E8F0" }}>Shown as one cart line — fast, clean checkout</div>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div style={{ fontSize: "1.7vw", color: "#E2E8F0" }}>Individual services printed on the receipt</div>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div style={{ fontSize: "1.7vw", color: "#E2E8F0" }}>Great for upselling &amp; increasing average spend</div>
              </div>
              <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginTop: "0.8vh", flexShrink: 0 }} />
                <div style={{ fontSize: "1.7vw", color: "#E2E8F0" }}>Each service still assigns its own stylist</div>
              </div>
            </div>
          </div>

          <div style={{ width: "38vw", display: "flex", flexDirection: "column", gap: "2vw' }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vw", flex: 1 }}>
              <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#F59E0B" }} />
                <div style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, marginBottom: "1.5vh" }}>VIP Package</div>
                <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh" }}>Haircut + Beard + Facial</div>
                <div style={{ fontSize: "2.5vw", fontWeight: 700 }}>AED 200</div>
              </div>
              <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#F59E0B" }} />
                <div style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, marginBottom: "1.5vh" }}>Bridal Package</div>
                <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh" }}>Hair + Makeup + Nails</div>
                <div style={{ fontSize: "2.5vw", fontWeight: 700 }}>AED 450</div>
              </div>
              <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#F59E0B" }} />
                <div style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, marginBottom: "1.5vh" }}>Gents Grooming</div>
                <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh" }}>Haircut + Beard + Scrub</div>
                <div style={{ fontSize: "2.5vw", fontWeight: 700 }}>AED 150</div>
              </div>
              <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#F59E0B" }} />
                <div style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, marginBottom: "1.5vh" }}>Spa Day</div>
                <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh" }}>Massage + Facial + Nails</div>
                <div style={{ fontSize: "2.5vw", fontWeight: 700 }}>AED 380</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "8vw", right: "8vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>10</div>
      </div>
    </div>
  );
}
