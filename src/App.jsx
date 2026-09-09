import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";

// ─── Theme Tokens (Scheme A: Navy & Royal Gold) ───────────────────────────────
const T = {
  bg: "#0A1128",        // Deep Navy Canvas
  surface: "#101F42",   // Navy Container Surface
  raised: "#172A59",    // Elevated Navy Card
  deep: "#060A17",      // Deep Sub-panel
  line: "#203A70",      // Card Borders & Dividers
  gold: "#F5A623",      // Royal Gold Accent & Buttons
  goldLight: "#FFBE42", // Bright Gold Hover
  goldDim: "#F5A62322", // Translucent Gold Tint
  goldGlow: "#F5A62355",// Glowing Accent Shadow
  white: "#F8FAFC",     // Primary Heading Text
  silver: "#CBD5E1",    // Secondary Body Text
  muted: "#7E92B5",     // Muted Captions & Subtext
  green: "#10B981",
  red: "#EF4444",
};

const AV_COLS = ["#F5A623", "#3B82F6", "#10B981", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316"];
const LOGO_IMG = "/logo.png";
const MAX_STAMPS = 10;

// ─── Supabase Client Config ───────────────────────────────────────────────────
const SUPABASE_URL = "https://uarrjmzbwbocipdlzhcm.supabase.co";
const SUPABASE_KEY = "sb_publishable_yFO3Y5w5iGCR2LfkFvr_Jg_T5Ocnfzd";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${txt}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  classes: {
    list: () => sb("classes?select=*&order=id.asc"),
    create: (data) => sb("classes", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => sb(`classes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id) => sb(`classes?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  },
  students: {
    list: (classId) => sb(classId ? `students?class_id=eq.${classId}&select=*&order=id.asc` : "students?select=*&order=id.asc"),
    create: (data) => sb("students", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => sb(`students?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id) => sb(`students?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  },
  gradeItems: {
    list: (classId) => sb(classId ? `grade_items?class_id=eq.${classId}&select=*&order=date.desc` : "grade_items?select=*&order=date.desc"),
    create: (data) => sb("grade_items", { method: "POST", body: JSON.stringify(data) }),
    remove: (id) => sb(`grade_items?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  },
  grades: {
    list: () => sb("grades?select=*"),
    upsert: (data) => sb("grades?on_conflict=grade_item_id,student_id", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    }),
    remove: (itemId, sid) => sb(`grades?grade_item_id=eq.${itemId}&student_id=eq.${sid}`, {
      method: "DELETE",
      prefer: "return=minimal"
    }),
  },
};

// ─── Sound Chime ─────────────────────────────────────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.start();
    osc.stop(ctx.currentTime + 0.28);
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) {}
}

// ─── Reusable Components ──────────────────────────────────────────────────────
function calcStamps(s) {
  return Math.min(MAX_STAMPS, Math.max(0, s.manualStamps || 0));
}

function Avatar({ name = "", size = 44, index = 0 }) {
  const col = AV_COLS[index % AV_COLS.length];
  const initials = name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, ${col}, ${col}aa)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.38, color: "#fff",
      boxShadow: `0 3px 12px ${col}44`, flexShrink: 0,
      fontFamily: "'Nunito',sans-serif",
    }}>
      {initials}
    </div>
  );
}

function StampCell({ index, filled }) {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 10,
      background: filled ? T.goldDim : T.deep,
      border: `1.5px solid ${filled ? T.gold : T.line}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 22, transition: "all .25s ease",
      boxShadow: filled ? `0 0 12px ${T.goldGlow}` : "none",
    }}>
      {filled ? "⭐" : (
        <span style={{ fontSize: 11, fontWeight: 700, color: T.line }}>{index + 1}</span>
      )}
    </div>
  );
}

function StampGrid({ manualStamps = 0 }) {
  const total = Math.min(MAX_STAMPS, Math.max(0, manualStamps));
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 8,
      maxWidth: 260,
    }}>
      {Array.from({ length: MAX_STAMPS }).map((_, i) => (
        <StampCell key={i} index={i} filled={i < total} />
      ))}
    </div>
  );
}

const inpSt = () => ({
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: `1.5px solid ${T.line}`, background: T.deep,
  color: T.white, fontSize: 14, fontFamily: "'Nunito',sans-serif",
  boxSizing: "border-box", outline: "none",
  transition: "border-color .2s",
});

function FL({ children }) {
  return <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 700, color: T.silver, marginBottom: 5 }}>{children}</div>;
}

function GradeItemForm({ onSave, onCancel }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [f, setF] = useState({ name: "", maxScore: 100, date: todayStr });

  function save() {
    if (!f.name.trim() || !f.maxScore) return;
    onSave({ name: f.name.trim(), maxScore: Number(f.maxScore), date: f.date || todayStr });
  }

  return (
    <div style={{
      background: T.raised, borderRadius: 20, padding: 22, marginBottom: 20,
      border: `1.5px solid ${T.gold}55`,
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${T.goldDim}`,
      animation: "popIn .3s cubic-bezier(.34,1.56,.64,1)",
    }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 700, color: T.gold, marginBottom: 18 }}>
        📊 New Grade Item
      </div>

      <div style={{ marginBottom: 13 }}>
        <FL>Quiz / Exam Name *</FL>
        <input
          value={f.name}
          onChange={e => setF(p => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Unit 1 Vocabulary Quiz"
          style={inpSt()}
          onFocus={e => e.target.style.borderColor = T.gold}
          onBlur={e => e.target.style.borderColor = T.line}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <div>
          <FL>Max Score *</FL>
          <input
            type="number" min="1"
            value={f.maxScore}
            onChange={e => setF(p => ({ ...p, maxScore: e.target.value }))}
            style={inpSt()}
            onFocus={e => e.target.style.borderColor = T.gold}
            onBlur={e => e.target.style.borderColor = T.line}
          />
        </div>
        <div>
          <FL>Date</FL>
          <input
            type="date"
            value={f.date}
            onChange={e => setF(p => ({ ...p, date: e.target.value }))}
            style={inpSt()}
            onFocus={e => e.target.style.borderColor = T.gold}
            onBlur={e => e.target.style.borderColor = T.line}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <OBtn label="Save Grade Item" onClick={save} style={{ flex: 1 }} />
        <GBtn label="Cancel" onClick={onCancel} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", top: 28, left: "50%", transform: "translateX(-50%)",
      background: T.gold, color: "#0A1128", padding: "12px 24px",
      borderRadius: 99, fontFamily: "'Nunito',sans-serif", fontSize: 14,
      fontWeight: 800, zIndex: 99999, whiteSpace: "nowrap",
      boxShadow: `0 8px 30px ${T.goldGlow}`,
      animation: "toastDown .35s cubic-bezier(.34,1.56,.64,1)",
    }}>
      {msg}
    </div>
  );
}

function OBtn({ label, onClick, disabled = false, small = false, style = {} }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? T.line : `linear-gradient(135deg, ${T.gold}, #D97706)`,
        color: disabled ? T.muted : "#0A1128",
        border: "none", borderRadius: small ? 8 : 12,
        padding: small ? "7px 14px" : "12px 22px",
        fontFamily: "'Nunito',sans-serif", fontWeight: 800,
        fontSize: small ? 13 : 15, cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 4px 18px ${T.goldGlow}`,
        transition: "all .2s ease", ...style,
      }}
    >
      {label}
    </button>
  );
}

function GBtn({ label, onClick, small = false, style = {} }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent", color: T.silver,
        border: `1.5px solid ${T.line}`, borderRadius: small ? 8 : 12,
        padding: small ? "7px 14px" : "11px 20px",
        fontFamily: "'Nunito',sans-serif", fontWeight: 700,
        fontSize: small ? 13 : 14, cursor: "pointer",
        transition: "all .2s ease", ...style,
      }}
    >
      {label}
    </button>
  );
}

// ─── Password Confirmation Modal for Deletion ─────────────────────────────────
function PasswordConfirmModal({
  title = "Security Verification",
  message = "This action cannot be undone. Enter your teacher password to confirm:",
  confirmText = "Verify & Delete",
  onConfirm,
  onCancel,
}) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");

  function handleVerify(e) {
    if (e) e.preventDefault();
    if (pwd === "rush625") {
      onConfirm();
    } else {
      setErr("Incorrect password! Action cancelled.");
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      backdropFilter: "blur(6px)", zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 390, background: T.surface,
        borderRadius: 22, padding: 26, border: `1.5px solid ${T.red}66`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.9)",
        animation: "popIn .25s cubic-bezier(.34,1.56,.64,1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🔒</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.white }}>
            {title}
          </div>
        </div>

        <div style={{ fontSize: 13, color: T.silver, lineHeight: 1.6, marginBottom: 18 }}>
          {message}
        </div>

        <form onSubmit={handleVerify}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 700 }}>
              Teacher Password Required
            </div>
            <input
              type="password"
              value={pwd}
              onChange={e => { setPwd(e.target.value); setErr(""); }}
              placeholder="Enter teacher password"
              autoFocus
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 12,
                background: T.deep, border: `1.5px solid ${err ? T.red : T.line}`,
                color: T.white, fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => { if (!err) e.target.style.borderColor = T.gold; }}
              onBlur={e => { if (!err) e.target.style.borderColor = T.line; }}
            />
            {err && (
              <div style={{ color: T.red, fontSize: 12, marginTop: 6, fontWeight: 700 }}>
                ⚠️ {err}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              style={{
                flex: 1, padding: "11px 0", borderRadius: 10,
                background: T.red, color: "#fff", border: "none",
                fontWeight: 800, fontSize: 14, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(239, 68, 68, 0.4)",
              }}
            >
              {confirmText}
            </button>
            <GBtn label="Cancel" onClick={onCancel} style={{ flex: 1 }} />
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Student QR Code Display Component ─────────────────────────────────────────
function StudentQRCode({ studentId, size = 110 }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(`BJ-STUDENT:${studentId}`, {
      width: size,
      margin: 1,
      color: { dark: "#0A1128", light: "#FFFFFF" }
    })
      .then(setDataUrl)
      .catch(() => {});
  }, [studentId, size]);

  if (!dataUrl) return <div style={{ width: size, height: size, background: "#fff", borderRadius: 8 }} />;
  return (
    <img
      src={dataUrl}
      alt={`QR Code ${studentId}`}
      style={{ width: size, height: size, borderRadius: 8, display: "block" }}
    />
  );
}

// ─── Camera QR Scanner Modal ─────────────────────────────────────────────────
function QRScannerModal({ onClose, onScanSuccess }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState("");
  const activeStreamRef = useRef(null);

  useEffect(() => {
    let animationFrameId;
    let scanning = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        activeStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true);
          await videoRef.current.play();
          requestAnimationFrame(scanLoop);
        }
      } catch (err) {
        setCameraError("Camera access denied or unavailable. Please check browser permissions.");
      }
    }

    function scanLoop() {
      if (!scanning) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code && code.data && code.data.startsWith("BJ-STUDENT:")) {
          const sid = parseInt(code.data.replace("BJ-STUDENT:", ""), 10);
          if (sid) {
            scanning = false;
            playChime();
            onScanSuccess(sid);
            return;
          }
        }
      }
      animationFrameId = requestAnimationFrame(scanLoop);
    }

    startCamera();

    return () => {
      scanning = false;
      cancelAnimationFrame(animationFrameId);
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [onScanSuccess]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(6, 10, 23, 0.88)",
      zIndex: 9999, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 20,
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: T.surface,
        borderRadius: 24, border: `1.5px solid ${T.line}`,
        padding: 20, display: "flex", flexDirection: "column",
        alignItems: "center", position: "relative",
        boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px ${T.goldGlow}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 700, color: T.gold }}>
            📷 Scan Student Badge
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: T.muted, fontSize: 24, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {cameraError ? (
          <div style={{ color: T.red, padding: 30, textAlign: "center", fontSize: 14 }}>
            {cameraError}
          </div>
        ) : (
          <div style={{
            position: "relative", width: "100%", height: 260,
            borderRadius: 16, overflow: "hidden", background: "#000",
            border: `2px solid ${T.gold}`
          }}>
            <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {/* Viewfinder Target */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)", width: 170, height: 170,
              border: `2px dashed ${T.gold}`, borderRadius: 14,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
            }} />
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 13, color: T.silver, textAlign: "center" }}>
          Point camera at the student's textbook or ID sticker
        </div>
      </div>
    </div>
  );
}

// ─── Quick Score Modal (Post-Scan Pop-up) ──────────────────────────────────────
function QuickScoreModal({ student, onClose, onAdjustPoints, onAdjustStamps, onScanNext }) {
  if (!student) return null;
  const stamps = calcStamps(student);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(6, 10, 23, 0.88)",
      zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, backdropFilter: "blur(6px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 390, background: T.surface,
        borderRadius: 24, border: `2px solid ${T.gold}`, padding: 22,
        boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 30px ${T.goldGlow}`,
        animation: "popIn .3s cubic-bezier(.34,1.56,.64,1)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <Avatar name={student.name} size={54} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 700, color: T.white }}>
              {student.name}
            </div>
            <div style={{ fontSize: 12, color: T.muted }}>
              Student ID #{student.id}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Points</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 700, color: T.gold }}>
              {student.points.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 10-Stamp Grid Card */}
        <div style={{
          background: T.deep, borderRadius: 16, padding: 14,
          border: `1px solid ${T.line}`, marginBottom: 16, display: "flex",
          flexDirection: "column", alignItems: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.silver }}>10-Stamp Reward Card</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.gold }}>{stamps} / {MAX_STAMPS}</span>
          </div>
          <StampGrid manualStamps={student.manualStamps} />
        </div>

        {/* Fast Point Adjustment */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 700 }}>⚡ Quick Points:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
            {[-100, -50, +50, +100].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => onAdjustPoints(student.id, d)}
                style={{
                  padding: "10px 0", borderRadius: 10,
                  background: d > 0 ? T.goldDim : T.raised,
                  color: d > 0 ? T.gold : T.silver,
                  border: `1px solid ${d > 0 ? `${T.gold}55` : T.line}`,
                  fontWeight: 800, fontSize: 15, cursor: "pointer",
                }}
              >
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
        </div>

        {/* Manual Stamp Action */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => onAdjustStamps(student.id, 1)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: T.goldDim, color: T.gold,
              border: `1.5px solid ${T.gold}`, fontWeight: 800, fontSize: 13, cursor: "pointer"
            }}
          >
            ⭐ +1 Star
          </button>
          <button
            type="button"
            onClick={() => onAdjustStamps(student.id, -1)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: T.raised, color: "#F87171",
              border: "1.5px solid #F8717166", fontWeight: 800, fontSize: 13, cursor: "pointer"
            }}
          >
            ⭐ -1 Star
          </button>
        </div>

        {/* Modal Controls */}
        <div style={{ display: "flex", gap: 10 }}>
          <OBtn label="📷 Scan Next" onClick={onScanNext} style={{ flex: 1 }} />
          <GBtn label="Done" onClick={onClose} style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

// ─── 3-Second Transition Screen ───────────────────────────────────────────────
function TransitionScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: T.bg, zIndex: 99999,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "24px 16px", textAlign: "center",
    }}>
      {/* Background Gold Radial Glow */}
      <div style={{
        position: "absolute", width: 450, height: 450, borderRadius: "50%",
        background: `radial-gradient(circle, ${T.gold}16 0%, transparent 68%)`,
        pointerEvents: "none",
      }} />

      {/* Circular Logo with Glowing Ring */}
      <div style={{
        width: 124, height: 124, borderRadius: "50%", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 22, boxShadow: `0 0 0 3px ${T.goldDim}, 0 10px 36px ${T.goldGlow}`,
        background: "transparent", position: "relative",
      }}>
        <img
          src={LOGO_IMG}
          alt="BJ American School Logo"
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      </div>

      {/* Single-line Title (White Cursive matching Learning with Wayne) */}
      <div style={{
        fontFamily: "'Dancing Script', cursive",
        fontSize: "clamp(28px, 8vw, 36px)",
        fontWeight: 700,
        color: T.white,
        marginBottom: 8,
        whiteSpace: "nowrap",
        letterSpacing: 0.5,
        lineHeight: 1.2,
      }}>
        BJ American School
      </div>

      {/* Single-line Subtitle (Gold Uppercase without 'class') */}
      <div style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: "clamp(11px, 3.2vw, 13px)",
        fontWeight: 800,
        color: T.gold,
        textTransform: "uppercase",
        letterSpacing: 2,
        whiteSpace: "nowrap",
      }}>
        Learning with Fun in Wayne's
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function handleSubmit(e) {
    if (e) e.preventDefault();
    setErr("");
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const uid = u.trim();
      const pwd = p.trim();
      if (uid === "wayneherry" && pwd === "rush625") {
        onLogin({ username: "wayneherry", role: "teacher" });
      } else {
        setErr("Invalid teacher username or password.");
      }
    }, 300);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      fontFamily: "'Nunito', sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "36px 16px 48px",
      position: "relative",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {/* Background Gold Radial Glow */}
      <div style={{
        position: "absolute", width: 520, height: 520, borderRadius: "50%",
        background: `radial-gradient(circle, ${T.gold}16 0%, transparent 68%)`,
        pointerEvents: "none",
      }} />

      <div style={{
        width: "100%", maxWidth: 410, position: "relative",
        animation: "popIn .45s cubic-bezier(.34,1.56,.64,1)",
      }}>
        {/* Top Logo + Brand (Full-screen header outside the card) */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 130, height: 130, borderRadius: "50%", margin: "0 auto 16px",
            background: "transparent", overflow: "hidden",
            boxShadow: `0 0 0 4px ${T.goldDim}, 0 12px 40px ${T.goldGlow}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img
              src={LOGO_IMG}
              alt="BJ American School Logo"
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </div>
          <div style={{
            fontFamily: "'Dancing Script', cursive", fontSize: 48, fontWeight: 700,
            color: T.gold, lineHeight: 1.15, marginBottom: 6,
          }}>
            BJ American School
          </div>
          <div style={{
            fontFamily: "'Nunito', sans-serif", fontSize: 14, color: T.silver,
            letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700,
          }}>
            Teacher's Hub
          </div>
        </div>

        {/* Input Card */}
        <div style={{
          background: T.surface,
          borderRadius: 24,
          padding: "28px 22px",
          border: `1.5px solid ${T.line}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.silver, marginBottom: 8 }}>Teacher ID</div>
              <input
                type="text"
                value={u}
                onChange={e => setU(e.target.value)}
                placeholder=""
                style={{
                  width: "100%", padding: "13px 16px", borderRadius: 12,
                  background: T.deep, border: `1.5px solid ${T.line}`, color: T.white,
                  fontSize: 15, outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = T.gold}
                onBlur={e => e.target.style.borderColor = T.line}
              />
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.silver, marginBottom: 8 }}>Password</div>
              <input
                type="password"
                value={p}
                onChange={e => setP(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "13px 16px", borderRadius: 12,
                  background: T.deep, border: `1.5px solid ${T.line}`, color: T.white,
                  fontSize: 15, outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = T.gold}
                onBlur={e => e.target.style.borderColor = T.line}
              />
            </div>

            {err && (
              <div style={{
                background: `${T.red}22`, border: `1px solid ${T.red}55`, color: T.red,
                padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: "center",
              }}>
                ⚠️ {err}
              </div>
            )}

            <OBtn
              label={busy ? "Loading…" : "Let's go! 🚀"}
              onClick={handleSubmit}
              disabled={busy}
              style={{ marginTop: 6, padding: "14px 0", fontSize: 16, width: "100%" }}
            />
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Class Hub (Multi-Classroom Management Screen) ────────────────────────────
function ClassSelectScreen({ classes, onSelectClass, onAddClass, onDeleteClass, onLogout }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [deleteTargetClass, setDeleteTargetClass] = useState(null);

  function handleCreate() {
    if (!newClassName.trim()) return;
    onAddClass(newClassName.trim());
    setNewClassName("");
    setShowAdd(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "28px 20px" }}>
      {/* Password Confirmation Modal for Deleting Class */}
      {deleteTargetClass && (
        <PasswordConfirmModal
          title="Delete Classroom"
          message={`Are you sure you want to permanently delete "${deleteTargetClass.name}"? All enrolled students, scores, and class data will be permanently erased.`}
          confirmText="Delete Classroom"
          onConfirm={() => {
            const cid = deleteTargetClass.id;
            setDeleteTargetClass(null);
            onDeleteClass(cid);
          }}
          onCancel={() => setDeleteTargetClass(null)}
        />
      )}

      <div style={{ maxWidth: 840, margin: "0 auto" }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
          <div>
            <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: 34, fontWeight: 700, color: T.gold }}>
              BJ American School
            </div>
            <div style={{ fontSize: 14, color: T.muted }}>Classroom Selection Hub</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <OBtn label="+ New Class" onClick={() => setShowAdd(true)} small />
            <GBtn label="Logout" onClick={onLogout} small />
          </div>
        </div>

        {/* Add Class Form */}
        {showAdd && (
          <div style={{
            background: T.surface, border: `1.5px solid ${T.gold}55`, borderRadius: 18,
            padding: 20, marginBottom: 24, boxShadow: `0 10px 30px ${T.goldGlow}`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.gold, marginBottom: 10 }}>
              ➕ Create New Classroom
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                value={newClassName}
                onChange={e => setNewClassName(e.target.value)}
                placeholder="e.g. Class 3A (Friday Phonics)"
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10,
                  background: T.deep, border: `1px solid ${T.line}`,
                  color: T.white, fontSize: 14, outline: "none",
                }}
              />
              <OBtn label="Save" onClick={handleCreate} small />
              <GBtn label="Cancel" onClick={() => setShowAdd(false)} small />
            </div>
          </div>
        )}

        {/* Class Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
          {classes.map((c, idx) => (
            <div
              key={c.id}
              style={{
                background: T.surface, borderRadius: 20, padding: 22,
                border: `1.5px solid ${T.line}`, position: "relative",
                boxShadow: "0 6px 20px rgba(0,0,0,0.4)", cursor: "pointer",
                transition: "all .2s ease",
              }}
              onClick={() => onSelectClass(c)}
            >
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 4,
                background: `linear-gradient(90deg, ${AV_COLS[idx % AV_COLS.length]}, transparent)`
              }} />
              <div style={{ fontSize: 22, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, color: T.white, marginBottom: 6 }}>
                {c.name}
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 18 }}>
                Class ID #{c.id}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.gold }}>
                  Enter Classroom ➔
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDeleteTargetClass(c); }}
                  style={{
                    background: "transparent", border: "none", color: T.muted,
                    fontSize: 12, cursor: "pointer", padding: "4px 8px"
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Class Dashboard ─────────────────────────────────────────────────────
function ClassDashboard({
  currentClass, onSwitchClass, students, setStudents,
  gradeItems, setGradeItems, grades, setGrades, onLogout,
  onStartUpdateStudent, onEndUpdateStudent,
}) {
  const [tab, setTab] = useState("students");
  const [toast, setToast] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedStudent, setScannedStudent] = useState(null);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [openGradeId, setOpenGradeId] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deleteTargetStudent, setDeleteTargetStudent] = useState(null);

  const say = msg => setToast(msg);

  // Points & Stamps adjustments with double-lock
  async function adjustPoints(sid, delta) {
    const s = students.find(x => x.id === sid);
    if (!s) return;
    const newPts = Math.max(0, (s.points || 0) + delta);
    setStudents(p => p.map(x => x.id === sid ? { ...x, points: newPts, _lastUpdated: Date.now() } : x));
    if (scannedStudent && scannedStudent.id === sid) {
      setScannedStudent(prev => ({ ...prev, points: newPts }));
    }
    say(`${delta > 0 ? "+" : ""}${delta} pts → ${s.name}`);
    if (onStartUpdateStudent) onStartUpdateStudent(sid);
    try {
      await db.students.update(sid, { points: newPts });
    } catch (e) {
      say("⚠️ Could not save points.");
    } finally {
      if (onEndUpdateStudent) onEndUpdateStudent(sid);
    }
  }

  async function adjustStamps(sid, delta) {
    const s = students.find(x => x.id === sid);
    if (!s) return;
    const newStamps = Math.max(0, Math.min(MAX_STAMPS, (s.manualStamps || 0) + delta));
    setStudents(p => p.map(x => x.id === sid ? { ...x, manualStamps: newStamps, _lastUpdated: Date.now() } : x));
    if (scannedStudent && scannedStudent.id === sid) {
      setScannedStudent(prev => ({ ...prev, manualStamps: newStamps }));
    }
    say(delta > 0 ? `⭐ Stamp awarded to ${s.name}!` : "⭐ Stamp removed.");
    if (onStartUpdateStudent) onStartUpdateStudent(sid);
    try {
      await db.students.update(sid, { manual_stamps: newStamps });
    } catch (e) {
      say("⚠️ Could not save stamp.");
    } finally {
      if (onEndUpdateStudent) onEndUpdateStudent(sid);
    }
  }

  async function handleAddStudent() {
    if (!newStudentName.trim()) return;
    try {
      const row = await db.students.create({
        class_id: currentClass.id,
        name: newStudentName.trim(),
        points: 0,
        manual_stamps: 0,
      });
      const created = Array.isArray(row) ? row[0] : row;
      setStudents(prev => [...prev, {
        id: created.id,
        name: created.name,
        points: 0,
        manualStamps: 0,
      }]);
      setNewStudentName("");
      setShowAddStudent(false);
      say(`🎉 Student ${created.name} added!`);
    } catch (e) {
      say("⚠️ Couldn't save student.");
    }
  }

  async function executeDeleteStudent(sid) {
    setStudents(prev => prev.filter(x => x.id !== sid));
    say("Student removed.");
    try {
      await db.students.remove(sid);
    } catch (e) {
      say("⚠️ Error removing student.");
    }
  }

  async function handleSaveEditStudent() {
    if (!editingStudent || !editingStudent.name.trim()) return;
    const newName = editingStudent.name.trim();
    const sid = editingStudent.id;
    setStudents(prev => prev.map(s => s.id === sid ? { ...s, name: newName, _lastUpdated: Date.now() } : s));
    if (scannedStudent && scannedStudent.id === sid) {
      setScannedStudent(prev => ({ ...prev, name: newName }));
    }
    setEditingStudent(null);
    say(`Student updated to ${newName}!`);
    if (onStartUpdateStudent) onStartUpdateStudent(sid);
    try {
      await db.students.update(sid, { name: newName });
    } catch (e) {
      say("⚠️ Error updating student name.");
    } finally {
      if (onEndUpdateStudent) onEndUpdateStudent(sid);
    }
  }

  async function addGradeItem(data) {
    try {
      const row = await db.gradeItems.create({
        class_id: currentClass.id,
        name: data.name,
        max_score: data.maxScore,
        date: data.date,
      });
      const created = Array.isArray(row) ? row[0] : row;
      const item = {
        id: created.id,
        name: created.name,
        maxScore: created.max_score ?? data.maxScore,
        date: created.date ?? data.date,
        classId: currentClass.id,
      };
      setGradeItems(p => [item, ...p]);
      setGrades(p => ({ ...p, [item.id]: {} }));
      setShowGradeForm(false);
      say(`📊 ${data.name} created!`);
    } catch (e) {
      say("⚠️ Couldn't create grade item.");
    }
  }

  async function deleteGradeItem(id) {
    if (!window.confirm("Delete this grade item?")) return;
    const prevItems = gradeItems, prevGrades = grades;
    setGradeItems(p => p.filter(g => g.id !== id));
    setGrades(p => { const n = { ...p }; delete n[id]; return n; });
    if (openGradeId === id) setOpenGradeId(null);
    try {
      await db.gradeItems.remove(id);
      say("Grade item deleted.");
    } catch (e) {
      setGradeItems(prevItems);
      setGrades(prevGrades);
      say("⚠️ Couldn't delete grade item.");
    }
  }

  // Grade score handling (upsert & delete)
  async function handleSaveScore(itemId, sid, scoreStr) {
    const scoreVal = scoreStr === "" ? null : Number(scoreStr);
    setGrades(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [sid]: scoreVal }
    }));
    try {
      if (scoreVal === null) {
        await db.grades.remove(itemId, sid);
        say("Score cleared.");
      } else {
        await db.grades.upsert({ grade_item_id: itemId, student_id: sid, score: scoreVal });
        say("Score saved!");
      }
    } catch (e) {
      say("⚠️ Score update failed.");
    }
  }

  // Camera QR Code Detection
  function handleScanSuccess(sid) {
    const found = students.find(s => s.id === sid);
    if (found) {
      setScannerOpen(false);
      setScannedStudent(found);
    } else {
      say(`⚠️ Student ID #${sid} not in ${currentClass.name}`);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "20px 16px 80px" }}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      {/* Camera Scanner Modal */}
      {scannerOpen && (
        <QRScannerModal
          onClose={() => setScannerOpen(false)}
          onScanSuccess={handleScanSuccess}
        />
      )}

      {/* Quick Action Scoring Modal */}
      {scannedStudent && (
        <QuickScoreModal
          student={scannedStudent}
          onClose={() => setScannedStudent(null)}
          onAdjustPoints={adjustPoints}
          onAdjustStamps={adjustStamps}
          onScanNext={() => {
            setScannedStudent(null);
            setScannerOpen(true);
          }}
        />
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(6px)", zIndex: 99999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            width: "100%", maxWidth: 390, background: T.surface,
            borderRadius: 22, padding: 26, border: `1.5px solid ${T.gold}66`,
            boxShadow: `0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px ${T.goldDim}`,
            animation: "popIn .25s cubic-bezier(.34,1.56,.64,1)",
          }}>
            <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, color: T.gold, marginBottom: 16 }}>
              ✏️ Edit Student Name
            </div>
            <form onSubmit={e => { e.preventDefault(); handleSaveEditStudent(); }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: T.silver, marginBottom: 8, fontWeight: 700 }}>Student Full Name *</div>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={e => setEditingStudent(p => ({ ...p, name: e.target.value }))}
                  placeholder="Student full name"
                  autoFocus
                  style={inpSt()}
                  onFocus={e => e.target.style.borderColor = T.gold}
                  onBlur={e => e.target.style.borderColor = T.line}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <OBtn label="Save Changes" onClick={handleSaveEditStudent} style={{ flex: 1 }} />
                <GBtn label="Cancel" onClick={() => setEditingStudent(null)} style={{ flex: 1 }} />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Student Password Confirmation Modal */}
      {deleteTargetStudent && (
        <PasswordConfirmModal
          title="Delete Student"
          message={`Are you sure you want to permanently remove "${deleteTargetStudent.name}"? All associated points, stamps, and grade records will be deleted.`}
          confirmText="Delete Student"
          onConfirm={() => {
            const sid = deleteTargetStudent.id;
            setDeleteTargetStudent(null);
            executeDeleteStudent(sid);
          }}
          onCancel={() => setDeleteTargetStudent(null)}
        />
      )}

      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        {/* Top Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 20, flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'Dancing Script', cursive", fontSize: 26, color: T.gold, fontWeight: 700 }}>
                BJ American School
              </span>
              <span style={{ color: T.line }}>/</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.white }}>
                {currentClass.name}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.muted }}>
              {students.length} students enrolled
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <OBtn
              label="📷 Scan QR"
              onClick={() => setScannerOpen(true)}
              style={{ boxShadow: `0 4px 20px ${T.goldGlow}` }}
            />
            <GBtn label="🔄 Switch Class" onClick={onSwitchClass} small />
            <GBtn label="Logout" onClick={onLogout} small />
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: `1.5px solid ${T.line}`, paddingBottom: 10 }}>
          {[
            { id: "students", label: "🏆 Students & Stamps" },
            { id: "grades", label: "📊 Exams & Grades" },
            { id: "badges", label: "🖨️ Print QR Badges" },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? T.gold : "transparent",
                color: tab === t.id ? "#0A1128" : T.silver,
                border: "none", borderRadius: 10, padding: "8px 16px",
                fontFamily: "'Nunito',sans-serif", fontWeight: 800,
                fontSize: 14, cursor: "pointer", transition: "all .2s ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── TAB 1: Students & 10-Stamp Cards ─── */}
        {tab === "students" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>
                Student Roster
              </div>
              <OBtn label="+ Add Student" onClick={() => setShowAddStudent(true)} small />
            </div>

            {/* Add Student Modal / Form */}
            {showAddStudent && (
              <div style={{
                background: T.surface, border: `1.5px solid ${T.gold}55`, borderRadius: 16,
                padding: 18, marginBottom: 20,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.gold, marginBottom: 10 }}>
                  Add Student to {currentClass.name}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={newStudentName}
                    onChange={e => setNewStudentName(e.target.value)}
                    placeholder="Student full name (e.g. Emma Wu)"
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: 10,
                      background: T.deep, border: `1px solid ${T.line}`,
                      color: T.white, fontSize: 14, outline: "none",
                    }}
                  />
                  <OBtn label="Save" onClick={handleAddStudent} small />
                  <GBtn label="Cancel" onClick={() => setShowAddStudent(false)} small />
                </div>
              </div>
            )}

            {/* Student Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {students.map((s, idx) => {
                const stamps = calcStamps(s);
                return (
                  <div
                    key={s.id}
                    style={{
                      background: T.surface, borderRadius: 20, padding: 18,
                      border: `1.5px solid ${T.line}`, display: "flex",
                      flexDirection: "column", gap: 14,
                      boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Avatar name={s.name} size={48} index={idx} />
                      <div>
                        <div
                          onClick={() => setEditingStudent({ id: s.id, name: s.name })}
                          style={{
                            fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, color: T.white,
                            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                          }}
                          title="Click to edit student name"
                        >
                          {s.name}
                          <span style={{ fontSize: 12, color: T.gold, opacity: 0.8 }}>✏️</span>
                        </div>
                        <div style={{ fontSize: 12, color: T.muted }}>
                          ID #{s.id} · {stamps} / {MAX_STAMPS} stamps
                        </div>
                      </div>

                      <div style={{ marginLeft: "auto", textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Points</div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 700, color: T.gold }}>
                          {s.points.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Stamp Grid */}
                    <div style={{ background: T.deep, borderRadius: 14, padding: 12, border: `1px solid ${T.line}` }}>
                      <StampGrid manualStamps={s.manualStamps} />
                    </div>

                    {/* Quick Adjust Buttons */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[-100, -50, +50, +100].map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => adjustPoints(s.id, d)}
                            style={{
                              padding: "7px 12px", borderRadius: 8,
                              background: d > 0 ? T.goldDim : T.raised,
                              color: d > 0 ? T.gold : T.silver,
                              border: `1px solid ${d > 0 ? `${T.gold}44` : T.line}`,
                              fontWeight: 800, fontSize: 13, cursor: "pointer",
                            }}
                          >
                            {d > 0 ? `+${d}` : d}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => adjustStamps(s.id, 1)}
                          style={{
                            padding: "6px 12px", borderRadius: 8,
                            background: T.goldDim, color: T.gold,
                            border: `1.5px solid ${T.gold}`, fontWeight: 800, fontSize: 13, cursor: "pointer",
                          }}
                        >
                          ⭐ +1
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustStamps(s.id, -1)}
                          style={{
                            padding: "6px 12px", borderRadius: 8,
                            background: T.raised, color: "#F87171",
                            border: "1.5px solid #F8717166", fontWeight: 800, fontSize: 13, cursor: "pointer",
                          }}
                        >
                          ⭐ -1
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStudent({ id: s.id, name: s.name })}
                          style={{
                            padding: "6px 11px", borderRadius: 8,
                            background: T.deep, color: T.gold,
                            border: `1px solid ${T.gold}55`, fontWeight: 700, fontSize: 13, cursor: "pointer",
                            display: "inline-flex", alignItems: "center", gap: 4,
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetStudent(s)}
                          style={{
                            padding: "6px 10px", borderRadius: 8,
                            background: "transparent", color: T.muted,
                            border: `1px solid ${T.line}`, fontSize: 12, cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── TAB 2: Exams & Grades ─── */}
        {tab === "grades" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>
                  Exams & Grades
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>
                  {gradeItems.length} grade item{gradeItems.length !== 1 ? "s" : ""}
                </div>
              </div>
              {!showGradeForm && (
                <OBtn label="+ New ✨" onClick={() => setShowGradeForm(true)} small />
              )}
            </div>

            {showGradeForm && (
              <GradeItemForm
                onSave={addGradeItem}
                onCancel={() => setShowGradeForm(false)}
              />
            )}

            {gradeItems.length === 0 && !showGradeForm && (
              <div style={{
                textAlign: "center", padding: "52px 0", color: T.muted,
                fontFamily: "'Cormorant Garamond',serif", fontSize: 22,
                background: T.surface, borderRadius: 20, border: `1.5px dashed ${T.line}`
              }}>
                No grade items yet ✨
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {gradeItems.map((g, i) => {
                const scores = grades[g.id] || {};
                const entered = students.filter(s => scores[s.id] !== undefined && scores[s.id] !== null);
                const avg = entered.length
                  ? (entered.reduce((sum, s) => sum + Number(scores[s.id]), 0) / entered.length).toFixed(1)
                  : "—";
                const maxScore = g.max_score ?? g.maxScore ?? 100;
                const isOpen = openGradeId === g.id;

                return (
                  <div
                    key={g.id}
                    style={{
                      background: T.surface, borderRadius: 20, padding: 18,
                      border: `1.5px solid ${T.line}`,
                      boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
                      animation: `popIn .35s ease ${i * 0.05}s both`,
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                      onClick={() => setOpenGradeId(isOpen ? null : g.id)}
                    >
                      <div>
                        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 700, color: T.white }}>
                          {g.name}
                        </div>
                        <div style={{ fontFamily: "'Nunito',sans-serif", fontSize: 12, color: T.muted, marginTop: 3 }}>
                          Max {maxScore} · {g.date} · {entered.length}/{students.length} graded · Avg {avg}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteGradeItem(g.id); }}
                          style={{
                            fontFamily: "'Nunito',sans-serif", fontSize: 12, color: T.muted,
                            background: "transparent", border: `1px solid ${T.line}`, borderRadius: 8,
                            padding: "6px 12px", cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                        <span style={{ color: T.gold, fontSize: 16, fontWeight: 800 }}>
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 16, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                        {students.length === 0 ? (
                          <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "10px 0" }}>
                            No students in this class yet.
                          </div>
                        ) : (
                          students.map((s, sIdx) => {
                            const curScore = scores[s.id];
                            return (
                              <div
                                key={s.id}
                                style={{
                                  display: "flex", alignItems: "center", gap: 12,
                                  padding: "8px 0", borderBottom: `1px solid ${T.deep}`
                                }}
                              >
                                <Avatar name={s.name} size={34} index={sIdx} />
                                <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: T.silver }}>
                                  {s.name}
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  max={maxScore}
                                  value={curScore ?? ""}
                                  placeholder="—"
                                  onChange={(e) => handleSaveScore(g.id, s.id, e.target.value)}
                                  style={{
                                    width: 68, textAlign: "center", padding: "8px", borderRadius: 8,
                                    background: T.deep, border: `1px solid ${T.line}`, color: T.white,
                                    fontSize: 14, outline: "none", fontWeight: 700,
                                  }}
                                />
                                <span style={{ fontSize: 12, color: T.muted, width: 36 }}>
                                  /{maxScore}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── TAB 3: Printable QR Badges ─── */}
        {tab === "badges" && (
          <div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 20,
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>
                  Printable Student QR Passports
                </div>
                <div style={{ fontSize: 13, color: T.muted }}>
                  Print on paper or sticker sheets to stick on textbook covers
                </div>
              </div>
              <OBtn label="🖨️ Print All Badges" onClick={() => window.print()} />
            </div>

            {/* Print Container */}
            <div
              id="printable-badges"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {students.map(s => (
                <div
                  key={s.id}
                  style={{
                    background: "#FFFFFF", borderRadius: 16, padding: 18,
                    color: "#0A1128", border: "2px solid #D1D5DB",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", textAlign: "center",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
                    pageBreakInside: "avoid",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#D97706", textTransform: "uppercase", letterSpacing: 1 }}>
                    BJ American School
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>
                    {currentClass.name}
                  </div>

                  <StudentQRCode studentId={s.id} size={130} />

                  <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, color: "#111827", marginTop: 10 }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#4B5563" }}>
                    Student Pass #{s.id}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root Application ─────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [inTransition, setInTransition] = useState(false);
  const [classes, setClasses] = useState([]);
  const [activeClass, setActiveClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [gradeItems, setGradeItems] = useState([]);
  const [grades, setGrades] = useState({});
  const [loading, setLoading] = useState(true);

  const pendingUpdatesRef = useRef({});

  function startUpdateStudent(sid) {
    pendingUpdatesRef.current[sid] = (pendingUpdatesRef.current[sid] || 0) + 1;
  }
  function endUpdateStudent(sid) {
    pendingUpdatesRef.current[sid] = Math.max(0, (pendingUpdatesRef.current[sid] || 0) - 1);
  }

  // Load Classes
  async function loadClasses() {
    try {
      const rows = await db.classes.list();
      if (rows && rows.length > 0) {
        setClasses(rows);
      } else {
        // Starter mockup classes
        setClasses([
          { id: 1, name: "Class 1A (Mon & Wed)" },
          { id: 2, name: "Class 2B (Tue & Thu)" },
        ]);
      }
    } catch (e) {
      setClasses([
        { id: 1, name: "Class 1A (Mon & Wed)" },
        { id: 2, name: "Class 2B (Tue & Thu)" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Load Active Class Data
  async function loadClassData(classId) {
    if (!classId) return;
    try {
      const [sRows, giRows, gRows] = await Promise.all([
        db.students.list(classId),
        db.gradeItems.list(classId),
        db.grades.list(),
      ]);

      if (sRows) {
        setStudents(prev => {
          return sRows.map(r => {
            const local = prev.find(x => x.id === r.id);
            const isPending = pendingUpdatesRef.current[r.id] > 0;
            const isRecent = local && local._lastUpdated && (Date.now() - local._lastUpdated < 4500);
            const keep = isPending || isRecent;
            return {
              id: r.id,
              name: r.name,
              points: keep && local ? local.points : (r.points || 0),
              manualStamps: keep && local ? local.manualStamps : (r.manual_stamps || 0),
              _lastUpdated: local ? local._lastUpdated : undefined,
            };
          });
        });
      }

      if (giRows) {
        setGradeItems(giRows.map(r => ({
          id: r.id,
          name: r.name,
          maxScore: r.max_score ?? r.maxScore ?? 100,
          date: r.date,
          classId: r.class_id,
        })));
      }

      if (gRows) {
        const gradeMap = {};
        gRows.forEach(g => {
          if (!gradeMap[g.grade_item_id]) gradeMap[g.grade_item_id] = {};
          gradeMap[g.grade_item_id][g.student_id] = g.score;
        });
        setGrades(gradeMap);
      }
    } catch (e) {}
  }

  useEffect(() => {
    loadClasses();
  }, []);

  // Polling active class every 3 seconds
  useEffect(() => {
    if (!activeClass) return;
    loadClassData(activeClass.id);
    const timer = setInterval(() => loadClassData(activeClass.id), 3000);
    return () => clearInterval(timer);
  }, [activeClass]);

  // Class Management Handlers
  async function handleAddClass(name) {
    try {
      const row = await db.classes.create({ name });
      const created = Array.isArray(row) ? row[0] : row;
      setClasses(p => [...p, created]);
    } catch (e) {
      setClasses(p => [...p, { id: Date.now(), name }]);
    }
  }

  async function handleDeleteClass(id) {
    setClasses(p => p.filter(c => c.id !== id));
    if (activeClass && activeClass.id === id) setActiveClass(null);
    try {
      await db.classes.remove(id);
    } catch (e) {}
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, color: T.gold }}>
        Loading BJ American School…
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={() => { setUser({ role: "teacher" }); setInTransition(true); }} />;
  }

  if (inTransition) {
    return <TransitionScreen onDone={() => setInTransition(false)} />;
  }

  if (!activeClass) {
    return (
      <ClassSelectScreen
        classes={classes}
        onSelectClass={c => setActiveClass(c)}
        onAddClass={handleAddClass}
        onDeleteClass={handleDeleteClass}
        onLogout={() => setUser(null)}
      />
    );
  }

  return (
    <ClassDashboard
      currentClass={activeClass}
      onSwitchClass={() => setActiveClass(null)}
      students={students}
      setStudents={setStudents}
      gradeItems={gradeItems}
      setGradeItems={setGradeItems}
      grades={grades}
      setGrades={setGrades}
      onLogout={() => { setUser(null); setActiveClass(null); }}
      onStartUpdateStudent={startUpdateStudent}
      onEndUpdateStudent={endUpdateStudent}
    />
  );
}
