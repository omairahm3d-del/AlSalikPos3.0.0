const base = import.meta.env.BASE_URL;

const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide01Hero() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ width: "52vw", height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: "8vw", paddingRight: "4vw", position: "relative", zIndex: 5 }}>
        <div style={{ display: "inline-flex", alignItems: "center", padding: "0.5vh 1vw", backgroundColor: "rgba(20,184,166,0.1)", border: "1px solid rgba(20,184,166,0.2)", borderRadius: "2vw", marginBottom: "3vh", alignSelf: "flex-start" }}>
          <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginRight: "0.5vw" }} />
          <span style={{ color: "#14B8A6", fontSize: "0.8vw", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>UAE Point of Sale</span>
        </div>

        <h1 style={{ fontSize: "6vw", fontWeight: 700, lineHeight: 1.05, margin: "0 0 2vh 0", letterSpacing: "-0.02em" }}>Al Salik POS</h1>

        <p style={{ fontSize: "1.8vw", color: "#94A3B8", margin: "0 0 4vh 0", lineHeight: 1.5, fontWeight: 400, fontFamily: "'Inter', sans-serif", maxWidth: "36vw" }}>
          Two powerful modes. One smart system. Built for UAE restaurants, salons &amp; retail.
        </p>

        <div style={{ width: "4vw", height: "0.4vh", backgroundColor: "#14B8A6", borderRadius: "0.2vh", marginBottom: "4vh" }} />

        <div style={{ display: "flex", gap: "2vw" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6" }} />
            <span style={{ color: "#94A3B8", fontSize: "1.2vw", fontFamily: "'Inter', sans-serif" }}>Restaurant Mode</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#F59E0B" }} />
            <span style={{ color: "#94A3B8", fontSize: "1.2vw", fontFamily: "'Inter', sans-serif" }}>Saloon Mode</span>
          </div>
        </div>
      </div>

      <div style={{ width: "48vw", height: "100vh", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: "30vw", height: "30vw", backgroundColor: "#14B8A6", borderRadius: "50%", filter: "blur(10vw)", opacity: 0.12, zIndex: 1 }} />
        <img
          src={`${base}hero.png`}
          crossOrigin="anonymous"
          alt="Al Salik POS"
          style={{ width: "52vw", height: "auto", maxHeight: "88vh", objectFit: "contain", position: "relative", zIndex: 2, transform: "translateX(-2vw) translateY(1vh)", filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))" }}
        />
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Confidential</div>
      </div>
    </div>
  );
}
