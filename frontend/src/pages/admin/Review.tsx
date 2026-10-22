import { motion } from "framer-motion";
import { ArrowLeft, Ban, CheckCircle2, ExternalLink, FileText, Landmark, ScrollText, ShieldCheck, User } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Modal, Skeleton, inputClass, statusTone, useToast, Field } from "../../components/ui";
import { api, errorMessage, timeAgo, useFetch } from "../../lib/api";
import type { ApplicationDetail } from "../../types";

const DOC_LABELS: Record<string, string> = {
  pan_card: "PAN card", shop_license: "Shop licence", owner_id: "Owner ID",
  address_proof: "Address proof", bank_proof: "Bank proof",
};

export default function ReviewApplication() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const app = useFetch<ApplicationDetail>(`/admin/applications/${shopId}`);
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function decide(decision: "approve" | "reject") {
    setSaving(true);
    try {
      await api(`/admin/applications/${shopId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: decision === "reject" ? reason.trim() : null }),
      });
      toast(decision === "approve" ? "Shop verified and now live" : "Application rejected. The seller has been notified.");
      navigate("/admin/applications", { replace: true });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
      setMode(null);
    }
  }

  if (app.loading && !app.data) return <Skeleton className="h-96" />;
  if (!app.data) return <p className="text-sm text-rose-600">{app.error ?? "Application not found"}</p>;
  const a = app.data;
  const pending = a.verification_status === "pending";
  const mapUrl = `https://www.google.com/maps?q=${a.lat},${a.lng}`;

  return (
    <div className="space-y-6">
      <Link to="/admin/applications" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> All applications
      </Link>

      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{a.shop_name}</h1>
          <p className="text-sm text-slate-500">{a.legal_name} · submitted {timeAgo(a.submitted_at)}</p>
        </div>
        <Badge tone={statusTone(a.verification_status)}>{a.verification_status}</Badge>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section icon={User} title="Owner & business">
            <Rows items={[
              ["Owner name", a.owner_full_name],
              ["Owner phone (account)", a.owner_phone],
              ["Legal business name", a.legal_name],
              ["Shop display name", a.shop_name],
            ]} />
          </Section>

          <Section icon={ScrollText} title="Tax & licences">
            <Rows items={[
              ["PAN", a.pan_number],
              ["GST", a.gst_number ?? "Not provided"],
              ["Shop licence / registration", a.shop_license_number],
              ["FSSAI", a.fssai_number ?? "Not provided"],
            ]} />
          </Section>

          <Section icon={Landmark} title="Settlement account">
            <Rows items={[
              ["Account number", a.bank_account_number],
              ["IFSC", a.bank_ifsc],
            ]} />
          </Section>

          <Section icon={FileText} title="Documents">
            {a.documents.length === 0 ? <p className="text-sm text-rose-600">No documents submitted.</p> : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {a.documents.map((d) => {
                  const [key, file] = d.split(":");
                  return (
                    <li key={d} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{DOC_LABELS[key] ?? key}</p>
                        <p className="truncate text-xs text-slate-500">{file}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-bold">Shop location</h2>
            <p className="text-sm text-slate-600">{a.address}</p>
            <p className="mt-2 font-mono text-xs text-slate-500">{a.lat.toFixed(5)}, {a.lng.toFixed(5)} · delivers {a.delivery_radius_km} km</p>
            <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Open in Google Maps <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Decision</h2>
            {pending ? (
              <>
                <p className="mb-4 text-sm text-slate-500">Check every document against the original before approving. Approved shops go live immediately.</p>
                <div className="flex flex-col gap-2">
                  <Button onClick={() => setMode("approve")}>Approve and go live</Button>
                  <Button variant="danger" onClick={() => setMode("reject")}><Ban className="h-4 w-4" /> Reject application</Button>
                </div>
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">
                  This application was <span className="font-semibold capitalize">{a.verification_status}</span>
                  {a.reviewed_at && ` ${timeAgo(a.reviewed_at)}`}.
                </p>
                {a.rejection_reason && <p className="rounded-lg bg-rose-50 p-3 text-rose-700">{a.rejection_reason}</p>}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={mode === "approve"} onClose={() => setMode(null)} title="Approve this seller?"
        footer={<><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button onClick={() => decide("approve")} loading={saving}>Yes, approve</Button></>}>
        <p className="text-sm text-slate-600">{a.shop_name} will become visible to customers within {a.delivery_radius_km} km of its location.</p>
      </Modal>

      <Modal open={mode === "reject"} onClose={() => setMode(null)} title="Reject application"
        footer={<><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button variant="danger" onClick={() => decide("reject")} loading={saving} disabled={reason.trim().length < 5}>Reject and notify seller</Button></>}>
        <Field label="Reason shown to the seller" hint="Be specific so they can fix it, e.g. 'PAN name does not match legal name'.">
          <textarea rows={4} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 flex items-center gap-2 font-bold"><Icon className="h-5 w-5 text-brand-600" /> {title}</h2>
      {children}
    </Card>
  );
}

function Rows({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{k}</dt>
          <dd className="mt-0.5 break-all font-semibold text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
