import React, { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import { useDatabase } from "@/context/DatabaseCore";

type Layout = "en" | "ar";

const ROWS_EN: string[][] = [
  ["1","2","3","4","5","6","7","8","9","0","-"],
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m",".",","],
];

const ROWS_AR: string[][] = [
  ["١","٢","٣","٤","٥","٦","٧","٨","٩","٠","-"],
  ["ض","ص","ث","ق","ف","غ","ع","ه","خ","ح","ج"],
  ["ش","س","ي","ب","ل","ا","ت","ن","م","ك","ط"],
  ["ئ","ء","ؤ","ر","ى","ة","و","ز","ظ","د","ذ"],
];

function isEditable(el: any): boolean {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    return ["text","search","email","tel","url","number","password","decimal","numeric"].includes(type);
  }
  if (tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const next = before + text + after;
  // React-controlled inputs need native setter
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next); else el.value = next;
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function backspaceAtCaret(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  if (start === 0 && end === 0) return;
  const before = start === end ? el.value.slice(0, Math.max(0, start - 1)) : el.value.slice(0, start);
  const after = el.value.slice(end);
  const next = before + after;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next); else el.value = next;
  const pos = before.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function VirtualKeyboard() {
  const db = useDatabase();
  const [mode, setMode] = useState<"off" | "builtin" | "windows-osk">("off");
  const [visible, setVisible] = useState(false);
  const [layout, setLayout] = useState<Layout>("en");
  const [shift, setShift] = useState(false);
  const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Load setting and refresh on focus
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const biz = await db.loadBusinessSettings();
        if (alive) setMode((biz?.keyboardMode as any) || "off");
      } catch {}
    };
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [db]);

  useEffect(() => {
    if (Platform.OS !== "web" || mode === "off") return;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as any;
      if (!isEditable(el)) return;
      // Skip our own keyboard buttons
      if (el.closest?.("[data-virtual-kb]")) return;
      targetRef.current = el;
      if (mode === "windows-osk") {
        const w: any = (window as any).electronPOS;
        if (w && typeof w.openOSK === "function") { w.openOSK(); }
      } else {
        setVisible(true);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      // Delay so clicking a key doesn't dismiss
      setTimeout(() => {
        const active = document.activeElement;
        if (active && active.closest?.("[data-virtual-kb]")) return;
        if (active && isEditable(active)) return;
        setVisible(false);
        targetRef.current = null;
      }, 150);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [mode]);

  const press = useCallback((ch: string) => {
    const el = targetRef.current;
    if (!el) return;
    const out = shift && layout === "en" ? ch.toUpperCase() : ch;
    insertAtCaret(el, out);
    if (shift) setShift(false);
  }, [shift, layout]);

  const onBackspace = useCallback(() => {
    const el = targetRef.current; if (!el) return;
    backspaceAtCaret(el);
  }, []);

  const onSpace = useCallback(() => {
    const el = targetRef.current; if (!el) return;
    insertAtCaret(el, " ");
  }, []);

  const onEnter = useCallback(() => {
    const el = targetRef.current; if (!el) return;
    if (el.tagName === "TEXTAREA") insertAtCaret(el, "\n");
    else el.blur();
  }, []);

  if (Platform.OS !== "web" || mode !== "builtin" || !visible) return null;

  const rows = layout === "ar" ? ROWS_AR : ROWS_EN;

  // Full-width keyboard with edge-to-edge keys
  const wrap: React.CSSProperties = {
    position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 999999,
    background: "#1B1F2A", borderTop: "1px solid #2A2F3D",
    padding: "10px 12px 14px", boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
    fontFamily: "Tahoma, Arial, sans-serif",
    direction: layout === "ar" ? "rtl" : "ltr",
  };
  const rowStyle: React.CSSProperties = {
    display: "grid", gap: 6, marginBottom: 6, width: "100%",
  };
  const keyBase: React.CSSProperties = {
    height: 56, padding: 0, borderRadius: 10,
    background: "#2A2F3D", color: "#fff", border: "1px solid #3A3F4D",
    fontSize: 20, fontWeight: 600, cursor: "pointer", userSelect: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const accent: React.CSSProperties = { ...keyBase, background: "#3B82F6", borderColor: "#3B82F6" };
  const ctrlKey: React.CSSProperties = { ...keyBase, background: "#383D4D", fontSize: 16 };

  // Find max columns to keep all rows aligned
  const maxCols = Math.max(...rows.map((r) => r.length));

  return (
    <div data-virtual-kb style={wrap} onMouseDown={(e) => e.preventDefault()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={{ ...(layout === "en" ? accent : ctrlKey), height: 36, padding: "0 14px", fontSize: 14 }} onClick={() => setLayout("en")}>EN</button>
          <button style={{ ...(layout === "ar" ? accent : ctrlKey), height: 36, padding: "0 14px", fontSize: 14 }} onClick={() => setLayout("ar")}>ع AR</button>
        </div>
        <button style={{ ...ctrlKey, height: 36, padding: "0 14px", fontSize: 14 }} onClick={() => setVisible(false)}>Hide ▼</button>
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ ...rowStyle, gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}>
          {row.map((ch) => (
            <button key={ch} style={keyBase} onClick={() => press(ch)}>
              {shift && layout === "en" ? ch.toUpperCase() : ch}
            </button>
          ))}
        </div>
      ))}
      <div style={{ ...rowStyle, gridTemplateColumns: layout === "en" ? "1.5fr 1.5fr 6fr 1.5fr" : "1.5fr 6fr 1.5fr" }}>
        {layout === "en" && (
          <button style={shift ? accent : ctrlKey} onClick={() => setShift((s) => !s)}>⇧ Shift</button>
        )}
        <button style={ctrlKey} onClick={onBackspace}>⌫ Back</button>
        <button style={keyBase} onClick={onSpace}>Space</button>
        <button style={accent} onClick={onEnter}>Enter ⏎</button>
      </div>
    </div>
  );
}
