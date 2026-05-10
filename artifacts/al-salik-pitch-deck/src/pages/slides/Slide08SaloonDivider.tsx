const base = import.meta.env.BASE_URL;

export default function Slide08SaloonDivider() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex" }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        backgroundSize: "4vw 4vh", pointerEvents: "none"
      }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#F59E0B", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ width: "52vw", height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: "8vw", paddingRight: "4vw", position: "relative", zIndex: 5 }}>
        <div style={{ display: "inline-flex", alignItems: "center", padding: "0.5vh 1vw", backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "2vw", marginBottom: "3vh", alignSelf: "flex-start" }}>
          <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B", marginRight: "0.5vw" }} />
          <span style={{ color: "#F59E0B", fontSize: "0.8vw", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Saloon Mode</span>
        </div>
        <h1 style={{ fontSize: "5.5vw", fontWeight: 700, lineHeight: 1.05, margin: "0 0 2vh 0", letterSpacing: "-0.02em" }}>For Salons, Spas &amp; Barbers</h1>
        <p style={{ fontSize: "1.8vw", color: "#94A3B8", margin: "0 0 4vh 0", lineHeight: 1.5, fontFamily: "'Inter', sans-serif", maxWidth: "36vw" }}>
          Everything in Restaurant Mode, plus tools built specifically for beauty and wellness businesses.
        </p>
        <div style={{ width: "4vw", height: "0.4vh", backgroundColor: "#F59E0B", borderRadius: "0.2vh" }} />
      </div>

      <div style={{ width: "48vw", height: "100vh", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: "30vw", height: "30vw", backgroundColor: "#F59E0B", borderRadius: "50%", filter: "blur(10vw)", opacity: 0.08, zIndex: 1 }} />
        <img
          src={`${base}salon.png`}
          crossOrigin="anonymous"
          alt="Luxury salon"
          style={{ width: "52vw", height: "auto", maxHeight: "88vh", objectFit: "contain", position: "relative", zIndex: 2, transform: "translateX(-2vw) translateY(1vh)", filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.6))" }}
        />
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>08</div>
      </div>
    </div>
  );
}
