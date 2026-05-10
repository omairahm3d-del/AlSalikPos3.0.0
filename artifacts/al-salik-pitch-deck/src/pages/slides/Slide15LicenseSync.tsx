const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide15LicenseSync() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative", gap: "5vw" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Platform</div>
          <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Licensing &amp; Sync</h2>
          <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "4vh", lineHeight: 1.5 }}>
            A cloud-based licensing model with offline-first data sync ensures every device stays current.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "2.2vh" }}>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>License key activation</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Each device activates with a unique key, pinned to a branch</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Online &amp; offline license types</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Online syncs continuously; offline activates once and runs locally</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Bidirectional catalog sync</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Products, categories &amp; customers sync both ways, last-write-wins</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Sales push with idempotency</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>No double-counted sales — safe to retry any push</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: "30vw", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(20,184,166,0.2)", borderRadius: "1vw", padding: "3vh 2.5vw" }}>
            <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, marginBottom: "2vh" }}>Sync status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Products</span>
                <span style={{ fontSize: "1.1vw", color: "#14B8A6", fontWeight: 600 }}>Synced</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Customers</span>
                <span style={{ fontSize: "1.1vw", color: "#14B8A6", fontWeight: 600 }}>Synced</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>Sales queue</span>
                <span style={{ fontSize: "1.1vw", color: "#14B8A6", fontWeight: 600 }}>0 pending</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.3vw", color: "#CBD5E1" }}>License</span>
                <span style={{ fontSize: "1.1vw", color: "#14B8A6", fontWeight: 600 }}>Active</span>
              </div>
            </div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(20,184,166,0.2)", borderRadius: "1vw", padding: "2.5vh 2.5vw", textAlign: "center" }}>
            <div style={{ fontSize: "3.5vw", fontWeight: 700, color: "#14B8A6" }}>99.9%</div>
            <div style={{ color: "#94A3B8", fontSize: "1.1vw", fontFamily: "'Inter', sans-serif", marginTop: "0.5vh" }}>Sync reliability</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>15</div>
      </div>
    </div>
  );
}
