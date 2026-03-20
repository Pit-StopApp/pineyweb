"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/components/DashboardShell";

export default function Settings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [clientId, setClientId] = useState("");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [lastSignIn, setLastSignIn] = useState("");
  const [notifs, setNotifs] = useState({ project_updates: true, billing: true, announcements: true });
  const [msg, setMsg] = useState("");

  // Edit states
  const [editName, setEditName] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [editPassword, setEditPassword] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete modal
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      setUserId(session.user.id);
      setEmail(session.user.email || "");
      setLastSignIn(session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Unknown");

      const { data } = await supabase.from("pineyweb_clients").select("id, business_name, full_name, email, notification_project_updates, notification_billing, notification_announcements, status").eq("user_id", session.user.id).single();
      if (!data || data.status === "pending") { router.push("/?pending=1"); return; }
      setClientId(data.id);
      setBusinessName(data.business_name || "");
      setFullName(data.full_name || "");
      setNewName(data.full_name || "");
      setNewEmail(data.email || session.user.email || "");
      setNotifs({ project_updates: data.notification_project_updates, billing: data.notification_billing, announcements: data.notification_announcements });
      setLoading(false);
    };
    init();
  }, [router]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const saveName = async () => {
    setSaving(true);
    await supabase.from("pineyweb_clients").update({ full_name: newName }).eq("id", clientId);
    await supabase.auth.updateUser({ data: { full_name: newName } });
    setFullName(newName);
    setEditName(false);
    flash("Name updated!");
    setSaving(false);
  };

  const saveEmail = async () => {
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) { flash(error.message); } else { flash("Confirmation email sent to new address."); setEditEmail(false); }
    setSaving(false);
  };

  const savePassword = async () => {
    if (newPw !== confirmPw) { flash("Passwords don't match."); return; }
    if (newPw.length < 6) { flash("Password must be at least 6 characters."); return; }
    setSaving(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: curPw });
    if (signInErr) { flash("Current password is incorrect."); setSaving(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { flash(error.message); } else { flash("Password updated!"); setEditPassword(false); setCurPw(""); setNewPw(""); setConfirmPw(""); }
    setSaving(false);
  };

  const toggleNotif = async (key: string, val: boolean) => {
    setNotifs(prev => ({ ...prev, [key]: val }));
    await supabase.from("pineyweb_clients").update({ [`notification_${key}`]: val }).eq("id", clientId);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, clientId, email }) });
      const data = await res.json();
      if (data.success) { await supabase.auth.signOut(); router.push("/?deleted=true"); }
      else { flash(data.error || "Delete failed."); }
    } catch { flash("Network error."); }
    setDeleting(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fef9f1" }}><p style={{ color: "#414942" }}>Loading...</p></div>;

  const inputCls = "w-full px-4 py-2.5 rounded-lg border text-sm" as const;

  return (
    <DashboardShell businessName={businessName} onLogout={handleLogout}>
      <div className="max-w-3xl mx-auto">
        <header className="mb-10">
          <span className="text-xs uppercase tracking-[0.15em] font-bold mb-2 block" style={{ color: "#805533" }}>Preferences</span>
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: "#1d1c17" }}>Account Settings</h1>
        </header>

        {msg && <div className="mb-6 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: "#b9efc5", color: "#00210e" }}>{msg}</div>}

        {/* Account Information */}
        <section className="rounded-xl p-8 mb-8 border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <h2 className="text-xl font-bold mb-6" style={{ color: "#1d1c17" }}>Account Information</h2>

          {/* Name */}
          <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: "rgba(193,201,191,0.2)" }}>
            <div>
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Full Name</p>
              {editName ? <input value={newName} onChange={e => setNewName(e.target.value)} className={inputCls} style={{ borderColor: "#c1c9bf", maxWidth: 300 }} /> : <p className="font-semibold" style={{ color: "#1d1c17" }}>{fullName}</p>}
            </div>
            {editName ? (
              <div className="flex gap-2">
                <button onClick={saveName} disabled={saving} className="px-4 py-1.5 rounded-md text-xs font-bold text-white" style={{ backgroundColor: "#4A7C59" }}>{saving ? "..." : "Save"}</button>
                <button onClick={() => { setEditName(false); setNewName(fullName); }} className="px-4 py-1.5 rounded-md text-xs font-bold border" style={{ color: "#414942", borderColor: "#c1c9bf" }}>Cancel</button>
              </div>
            ) : <button onClick={() => setEditName(true)} className="text-xs font-bold underline underline-offset-4" style={{ color: "#316342" }}>Edit</button>}
          </div>

          {/* Email */}
          <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: "rgba(193,201,191,0.2)" }}>
            <div>
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Email</p>
              {editEmail ? <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" className={inputCls} style={{ borderColor: "#c1c9bf", maxWidth: 300 }} /> : <p className="font-semibold" style={{ color: "#1d1c17" }}>{email}</p>}
            </div>
            {editEmail ? (
              <div className="flex gap-2">
                <button onClick={saveEmail} disabled={saving} className="px-4 py-1.5 rounded-md text-xs font-bold text-white" style={{ backgroundColor: "#4A7C59" }}>{saving ? "..." : "Save"}</button>
                <button onClick={() => setEditEmail(false)} className="px-4 py-1.5 rounded-md text-xs font-bold border" style={{ color: "#414942", borderColor: "#c1c9bf" }}>Cancel</button>
              </div>
            ) : <button onClick={() => setEditEmail(true)} className="text-xs font-bold underline underline-offset-4" style={{ color: "#316342" }}>Edit</button>}
          </div>

          {/* Password */}
          <div className="py-4">
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Password</p>
            {editPassword ? (
              <div className="space-y-3 max-w-sm">
                <input value={curPw} onChange={e => setCurPw(e.target.value)} type="password" placeholder="Current password" className={inputCls} style={{ borderColor: "#c1c9bf" }} />
                <input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" placeholder="New password" className={inputCls} style={{ borderColor: "#c1c9bf" }} />
                <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type="password" placeholder="Confirm new password" className={inputCls} style={{ borderColor: "#c1c9bf" }} />
                <div className="flex gap-2">
                  <button onClick={savePassword} disabled={saving} className="px-4 py-1.5 rounded-md text-xs font-bold text-white" style={{ backgroundColor: "#4A7C59" }}>{saving ? "..." : "Update Password"}</button>
                  <button onClick={() => { setEditPassword(false); setCurPw(""); setNewPw(""); setConfirmPw(""); }} className="px-4 py-1.5 rounded-md text-xs font-bold border" style={{ color: "#414942", borderColor: "#c1c9bf" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditPassword(true)} className="text-xs font-bold underline underline-offset-4" style={{ color: "#316342" }}>Change Password</button>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section className="rounded-xl p-8 mb-8 border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#1d1c17" }}>Notifications</h2>
          <div className="p-4 rounded-lg mb-6 text-sm" style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#92400e" }}>
            We recommend keeping notifications on so you don&apos;t miss important project updates or billing reminders.
          </div>
          {[
            { key: "project_updates", label: "Project Updates", desc: "Build progress, site launches, change request confirmations" },
            { key: "billing", label: "Billing", desc: "Payment confirmations, subscription changes, invoice reminders" },
            { key: "announcements", label: "Announcements", desc: "New features, service updates, maintenance notices" },
          ].map(n => (
            <div key={n.key} className="flex items-center justify-between py-4 border-b" style={{ borderColor: "rgba(193,201,191,0.1)" }}>
              <div>
                <p className="font-semibold text-sm" style={{ color: "#1d1c17" }}>{n.label}</p>
                <p className="text-xs" style={{ color: "#414942" }}>{n.desc}</p>
              </div>
              <button onClick={() => toggleNotif(n.key, !notifs[n.key as keyof typeof notifs])} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ backgroundColor: notifs[n.key as keyof typeof notifs] ? "#4A7C59" : "#e7e2da" }}>
                <span className="inline-block h-4 w-4 transform rounded-full bg-white transition" style={{ transform: notifs[n.key as keyof typeof notifs] ? "translateX(22px)" : "translateX(4px)" }} />
              </button>
            </div>
          ))}
        </section>

        {/* Security */}
        <section className="rounded-xl p-8 mb-8 border" style={{ backgroundColor: "#f8f3eb", borderColor: "rgba(193,201,191,0.2)" }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#1d1c17" }}>Security</h2>
          <div className="flex items-center justify-between py-4 border-b" style={{ borderColor: "rgba(193,201,191,0.1)" }}>
            <div>
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#414942" }}>Last Login</p>
              <p className="font-semibold text-sm" style={{ color: "#1d1c17" }}>{lastSignIn}</p>
            </div>
          </div>
          <div className="py-4">
            <button onClick={async () => { await supabase.auth.signOut({ scope: "others" }); flash("All other sessions signed out."); }} className="px-5 py-2 rounded-md text-xs font-bold border transition-colors" style={{ color: "#316342", borderColor: "#316342" }}>
              Sign out all other devices
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="rounded-xl p-8 border" style={{ backgroundColor: "#ffffff", borderColor: "rgba(186,26,26,0.2)" }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: "#ba1a1a" }}>Danger Zone</h2>
          <p className="text-sm mb-4" style={{ color: "#414942" }}>Permanently delete your account and all associated data. This cannot be undone.</p>
          <button onClick={() => setShowDelete(true)} className="px-5 py-2 rounded-md text-xs font-bold text-white" style={{ backgroundColor: "#ba1a1a" }}>Delete Account</button>
        </section>

        {/* Delete Modal */}
        {showDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="w-full max-w-md p-8 rounded-xl" style={{ backgroundColor: "#ffffff" }}>
              <h3 className="text-xl font-bold mb-4" style={{ color: "#ba1a1a" }}>Delete Account</h3>
              <p className="text-sm mb-4" style={{ color: "#414942" }}>This will permanently delete your account, all site content, orders, and data. Type <strong>DELETE</strong> to confirm.</p>
              <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder='Type "DELETE"' className={inputCls} style={{ borderColor: "#c1c9bf", marginBottom: 16 }} />
              <div className="flex gap-3">
                <button onClick={handleDelete} disabled={deleteConfirm !== "DELETE" || deleting} className="px-6 py-2.5 rounded-md text-sm font-bold text-white disabled:opacity-40" style={{ backgroundColor: "#ba1a1a" }}>{deleting ? "Deleting..." : "Confirm Delete"}</button>
                <button onClick={() => { setShowDelete(false); setDeleteConfirm(""); }} className="px-6 py-2.5 rounded-md text-sm font-bold border" style={{ color: "#414942", borderColor: "#c1c9bf" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
