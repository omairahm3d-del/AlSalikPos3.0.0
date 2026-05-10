const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide16Hardware() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative" }}>
        <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Platform</div>
        <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Hardware &amp; Devices</h2>
        <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", maxWidth: "50vw", marginBottom: "5vh", lineHeight: 1.5 }}>
          One codebase. Mobile, web, and Windows desktop — all supported out of the box.
        </p>

        <div style={{ display: "flex", gap: "2vw", flex: 1 }}>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "4vh 3vw", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2vh", fontFamily: "'Inter', sans-serif" }}>Mobile &amp; Tablet</div>
            <div style={{ fontSize: "2.5vw", fontWeight: 700, marginBottom: "1.5vh" }}>iOS &amp; Android</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Full POS on phone or tablet</span>
              </div>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Barcode scanning via camera</span>
              </div>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Bluetooth receipt printing</span>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "4vh 3vw", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2vh", fontFamily: "'Inter', sans-serif" }}>Desktop</div>
            <div style={{ fontSize: "2.5vw", fontWeight: 700, marginBottom: "1.5vh" }}>Windows App</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Electron-packaged installer</span>
              </div>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Direct receipt &amp; kitchen printing</span>
              </div>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Cash drawer control</span>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "4vh 3vw", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2vh", fontFamily: "'Inter', sans-serif" }}>Peripherals</div>
            <div style={{ fontSize: "2.5vw", fontWeight: 700, marginBottom: "1.5vh" }}>Plug &amp; Play</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Thermal receipt printers</span>
              </div>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>USB barcode scanners</span>
              </div>
              <div style={{ display: "flex", gap: "0.8vw" }}>
                <div style={{ width: "0.4vw", height: "0.4vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.6vh", flexShrink: 0 }} />
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Cash drawers (Windows)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>16</div>
      </div>
    </div>
  );
}
