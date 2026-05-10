const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide06RestOps() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative" }}>
        <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Restaurant Mode</div>
        <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Built for UAE Operations</h2>
        <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", maxWidth: "50vw", marginBottom: "5vh", lineHeight: 1.5 }}>
          Runs offline, scales to multiple branches, works on any device from phone to Windows desktop.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vw" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Connectivity</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Offline-first</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Works without internet. Syncs automatically when reconnected.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Devices</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Any device</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Phone, tablet &amp; Windows desktop with thermal printing.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Scale</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Multi-branch</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Each location has its own data, reports &amp; device licenses.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Access</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Staff PIN login</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Role-based access for cashier, manager &amp; admin.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Customers</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>CRM built in</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Credit accounts &amp; loyalty points per customer.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6", opacity: 0.8 }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Compliance</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>UAE VAT</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>5% VAT. Simplified tax invoices. TRN on every receipt.</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>06</div>
      </div>
    </div>
  );
}
