const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide07RestCustomers() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative", gap: "4vw" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Restaurant Mode</div>
          <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Customer Management</h2>
          <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", marginBottom: "4vh", lineHeight: 1.5 }}>
            Keep customers coming back with built-in loyalty and credit accounts.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Loyalty points per purchase</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Points accumulate and can be redeemed at checkout</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Credit accounts</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Run a tab for trusted customers, settle at month end</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Full purchase history</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Every transaction linked to a customer profile</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", backgroundColor: "#14B8A6", marginTop: "0.8vh", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "1.8vw", fontWeight: 600, marginBottom: "0.3vh" }}>Syncs across all branch devices</div>
                <div style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif" }}>Customer data available wherever they visit</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: "32vw", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2.5vw" }}>
            <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif", marginBottom: "1.5vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer balance</div>
            <div style={{ display: "flex", gap: "3vw" }}>
              <div>
                <div style={{ fontSize: "3vw", fontWeight: 700, color: "#14B8A6" }}>480</div>
                <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif" }}>Loyalty pts</div>
              </div>
              <div>
                <div style={{ fontSize: "3vw", fontWeight: 700 }}>AED 200</div>
                <div style={{ color: "#94A3B8", fontSize: "1vw", fontFamily: "'Inter', sans-serif" }}>Credit balance</div>
              </div>
            </div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "1vw", padding: "2.5vh 2.5vw" }}>
            <div style={{ fontSize: "1.2vw", fontWeight: 600, marginBottom: "2vh" }}>Loyalty tiers — example</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1vw", marginBottom: "0.8vh", color: "#94A3B8" }}>
                  <span>Bronze (0–199 pts)</span><span>35%</span>
                </div>
                <div style={{ width: "100%", height: "0.6vh", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "0.3vh" }}>
                  <div style={{ width: "35%", height: "100%", backgroundColor: "#14B8A6", borderRadius: "0.3vh" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1vw", marginBottom: "0.8vh", color: "#94A3B8" }}>
                  <span>Silver (200–499 pts)</span><span>45%</span>
                </div>
                <div style={{ width: "100%", height: "0.6vh", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "0.3vh" }}>
                  <div style={{ width: "45%", height: "100%", backgroundColor: "#14B8A6", borderRadius: "0.3vh" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1vw", marginBottom: "0.8vh", color: "#94A3B8" }}>
                  <span>Gold (500+ pts)</span><span>20%</span>
                </div>
                <div style={{ width: "100%", height: "0.6vh", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "0.3vh" }}>
                  <div style={{ width: "20%", height: "100%", backgroundColor: "#14B8A6", borderRadius: "0.3vh" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>07</div>
      </div>
    </div>
  );
}
