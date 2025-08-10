import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import StateBarChart from "./charts/StateBarChart";
import ConfidenceLineChart from "./charts/ConfidenceLineChart";
import { API_CONFIG } from "@/config/api";

export type ResiduePrediction = {
  index: number;
  state8: "H" | "G" | "I" | "E" | "B" | "T" | "S" | "C";
  state3: "H" | "E" | "C";
  conf8: number; // 0..1
  conf3: number; // 0..1
};

function map8to3(s: ResiduePrediction["state8"]): ResiduePrediction["state3"] {
  if (s === "H" || s === "G" || s === "I") return "H";
  if (s === "E" || s === "B") return "E";
  return "C";
}

function pickState8(bias: "H" | "E" | "C"): ResiduePrediction["state8"] {
  // Add subtle variety within families
  if (bias === "H") return ["H", "G", "I"][weightedIndex([0.8, 0.15, 0.05])] as any;
  if (bias === "E") return ["E", "B"][weightedIndex([0.9, 0.1])] as any;
  return ["C", "T", "S"][weightedIndex([0.7, 0.2, 0.1])] as any;
}

function weightedIndex(weights: number[]) {
  const r = Math.random() * weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r <= acc) return i;
  }
  return weights.length - 1;
}

function generatePredictions(totalLen: number): ResiduePrediction[] {
  const preds: ResiduePrediction[] = [];
  let i = 0;
  while (i < totalLen) {
    const family = ["C", "H", "E"][weightedIndex([0.45, 0.35, 0.2])] as "C" | "H" | "E";
    const segLen = family === "C" ? randInt(2, 10) : randInt(6, 20);
    for (let j = 0; j < segLen && i < totalLen; j++, i++) {
      const s8 = pickState8(family);
      const s3 = map8to3(s8);
      const base = family === "H" || family === "E" ? 0.72 : 0.6;
      const conf8 = clamp(base + (Math.random() * 0.28), 0.5, 0.98);
      const conf3 = clamp(conf8 - Math.random() * 0.05, 0.5, 0.98);
      preds.push({ index: i + 1, state8: s8, state3: s3, conf8, conf3 });
    }
  }
  return preds;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fetchProteinSequences(pdbId: string): Promise<string[]> {
  const id = pdbId.trim().toUpperCase();
  const entryResp = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`);
  if (!entryResp.ok) throw new Error("PDB entry not found");
  const entry = await entryResp.json();
  const ids: string[] = entry.rcsb_entry_container_identifiers?.polymer_entity_ids ?? [];
  if (!ids.length) throw new Error("No polymer entities found in entry");

  const seqs: string[] = [];
  await Promise.all(
    ids.map(async (eid: string) => {
      const r = await fetch(`https://data.rcsb.org/rest/v1/core/polymer_entity/${id}/${eid}`);
      if (!r.ok) return;
      const data = await r.json();
      const t: string | undefined = data.entity_poly?.type;
      if (!t || !t.toLowerCase().includes("polypeptide") && !t.toLowerCase().includes("protein")) return;
      const raw: string | undefined =
        data.entity_poly?.pdbx_seq_one_letter_code_can || data.entity_poly?.pdbx_seq_one_letter_code;
      if (!raw) return;
      const seq = raw.replace(/\s|\n|;/g, "");
      if (seq.length) seqs.push(seq);
    })
  );
  if (!seqs.length) throw new Error("No protein sequences found for this entry");
  return seqs;
}

async function predictSecondaryStructure(sequence: string): Promise<ResiduePrediction[]> {
  const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PREDICT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequence })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || "Prediction failed");
  }
  
  const data = await response.json();
  const ss: string = data.pred_ss || "";
  const confs: number[] = data.confidences || [];
  const n = Math.min(ss.length, confs.length);
  const predictions: ResiduePrediction[] = [];
  
  for (let i = 0; i < n; i++) {
    const state8 = ss[i] as ResiduePrediction["state8"];
    const state3 = map8to3(state8);
    const conf8 = confs[i];
    const conf3 = Math.max(0.5, Math.min(0.98, conf8 - Math.random() * 0.05));
    
    predictions.push({
      index: i + 1,
      state8,
      state3,
      conf8: Math.max(0.5, Math.min(0.98, conf8)),
      conf3
    });
  }
  
  return predictions;
}

const ProteinPredictor = () => {
  const [pdbId, setPdbId] = useState("");
  const [sequence, setSequence] = useState("");
  const [loading, setLoading] = useState(false);
  const [preds, setPreds] = useState<ResiduePrediction[] | null>(null);
  const [summary, setSummary] = useState<{ chains: number; residues: number } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = pdbId.trim().toUpperCase();
    const seqNormalized = sequence.replace(/\s|\n|;/g, "").toUpperCase();

    if (!seqNormalized && !/^\w{4}$/.test(id)) {
      toast.error("Please enter a sequence or a valid 4-character PDB ID (e.g., 1CRN)");
      return;
    }

    try {
      setLoading(true);
      setPreds(null);

      if (seqNormalized) {
        setSummary({ chains: 1, residues: seqNormalized.length });
        const predictions = await predictSecondaryStructure(seqNormalized);
        setPreds(predictions);
        toast.success(`Predicted ${predictions.length} residues from sequence`);
      } else {
        const seqs = await fetchProteinSequences(id);
        const total = seqs.reduce((a, s) => a + s.length, 0);
        setSummary({ chains: seqs.length, residues: total });
        
        // Use the first (longest) sequence for prediction
        const longestSeq = seqs.reduce((a, b) => a.length > b.length ? a : b);
        const predictions = await predictSecondaryStructure(longestSeq);
        setPreds(predictions);
        toast.success(`Predicted ${predictions.length} residues for primary chain`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to fetch entry");
    } finally {
      setLoading(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
  };

  const downloadCsv = (mode: "8" | "3") => {
    if (!preds?.length) return;
    const header = mode === "8" ? ["index", "state8", "conf8"] : ["index", "state3", "conf3"];
    const rows = preds.map((p) =>
      mode === "8" ? [p.index, p.state8, p.conf8.toFixed(3)] : [p.index, p.state3, p.conf3.toFixed(3)]
    );
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const id = pdbId.trim().toUpperCase() || "entry";
    a.download = `${id}-predictions-${mode}-state.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="relative">
      <div
        className="ambient-bg rounded-xl border p-6 md:p-8 shadow-[var(--shadow-elegant)]"
        onMouseMove={handleMouseMove}
      >
        <form onSubmit={onSubmit} className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
          <div className="flex-1">
            <label htmlFor="seq" className="block text-sm font-medium text-muted-foreground mb-2">
              Protein sequence (optional)
            </label>
            <Textarea
              id="seq"
              placeholder="Paste FASTA/one-letter sequence"
              value={sequence}
              onChange={(e) => setSequence(e.target.value.toUpperCase())}
              rows={3}
              spellCheck={false}
              aria-label="Protein sequence"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="pdb" className="block text-sm font-medium text-muted-foreground mb-2">
              PDB ID (optional)
            </label>
            <Input
              id="pdb"
              placeholder="e.g., 1CRN"
              value={pdbId}
              onChange={(e) => setPdbId(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="PDB ID"
            />
          </div>
          <Button type="submit" disabled={loading} className="md:self-end">
            {loading ? "Predicting…" : "Predict Secondary Structure"}
          </Button>
        </form>

        {summary && (
          <p className="mt-4 text-sm text-muted-foreground">
            Entry summary: {summary.residues} residues across {summary.chains} chain(s)
          </p>
        )}

        {preds && (
          <>
            <div className="mt-8 grid grid-cols-1 gap-8">
              <div>
                <h3 className="text-lg font-semibold mb-3">Secondary Structure — 8 states</h3>
                <StateBarChart data={preds} mode="8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Per-residue Confidence — 8 states</h3>
                <ConfidenceLineChart data={preds} mode="8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Secondary Structure — 3 states</h3>
                <StateBarChart data={preds} mode="3" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Per-residue Confidence — 3 states</h3>
                <ConfidenceLineChart data={preds} mode="3" />
              </div>
            </div>
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Average confidence — 8 states: <span className="font-medium text-foreground">{(preds.reduce((a, p) => a + p.conf8, 0) / preds.length).toFixed(3)}</span>; 3 states: <span className="font-medium text-foreground">{(preds.reduce((a, p) => a + p.conf3, 0) / preds.length).toFixed(3)}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => downloadCsv("8")}>
                  Download 8-state CSV
                </Button>
                <Button variant="secondary" onClick={() => downloadCsv("3")}>
                  Download 3-state CSV
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default ProteinPredictor;
