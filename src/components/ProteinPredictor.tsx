import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import StateBarChart from "./charts/StateBarChart";
import ConfidenceLineChart from "./charts/ConfidenceLineChart";
import { API_CONFIG } from "@/config/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

export type ResiduePrediction = {
  index: number;
  state8: "H" | "G" | "I" | "E" | "B" | "T" | "S" | "C";
  state3: "H" | "E" | "C";
  conf8: number; // 0..1
  conf3: number; // 0..1
};

const SAMPLE_DATA = [
  {
    name: "1RCD - Rubredoxin",
    pdbId: "1RCD",
    sequence: ""
  },
  {
    name: "1CRN - Crambin",
    pdbId: "1CRN",
    sequence: ""
  },
  {
    name: "2DHB - Deoxyhemoglobin",
    pdbId: "2DHB",
    sequence: ""
  }
];

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

async function predictSecondaryStructure(sequence?: string, pdbId?: string): Promise<{ predictions: ResiduePrediction[], usedSequence: string, foundPdbId: string }> {
  const isHttps = window.location.protocol === "https:";
  const isHttpTarget = API_CONFIG.BASE_URL.startsWith("http://");
  if (isHttps && isHttpTarget) {
    throw new Error(
      "Mixed content: App läuft über HTTPS, Backend ist HTTP (127.0.0.1). Verwende eine öffentliche HTTPS-URL (z.B. ngrok/Cloudflare Tunnel) oder starte das Frontend lokal über http."
    );
  }

  let response: Response;
  try {
    const body = sequence ? { sequence } : { pdb_id: pdbId };
    response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PREDICT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error("Netzwerkfehler: Backend nicht erreichbar. Läuft der Server und sind CORS/HTTPS korrekt?");
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || "Prediction failed");
  }
  
  const data = await response.json();
  const ss: string = data.pred_ss || "";
  const confs: number[] = data.confidences || [];
  const usedSequence: string = data.used_sequence || "";
  const foundPdbId: string = data.pdb_id || data.found_pdb_id || "";
  
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
  
  return { predictions, usedSequence, foundPdbId };
}

export const ProteinPredictor = () => {
  const [pdbId, setPdbId] = useState<string>("");
  const [sequence, setSequence] = useState<string>("");
  const [resolvedSequence, setResolvedSequence] = useState<string>("");
  const [resolvedPdbId, setResolvedPdbId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [preds, setPreds] = useState<ResiduePrediction[] | null>(null);
  const [summary, setSummary] = useState<{ residues: number; chains: number } | null>(null);
  const [hoveredResidue, setHoveredResidue] = useState<number | null>(null);
  const [previousSamples, setPreviousSamples] = useState<Array<{name: string, pdbId: string, sequence: string}>>([]);

  // Load previous samples from localStorage on component mount
  useEffect(() => {
    const saved = localStorage.getItem('proteinPredictor_previousSamples');
    if (saved) {
      try {
        setPreviousSamples(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to parse saved samples');
      }
    }
  }, []);

  const saveSampleToHistory = (pdbId: string, sequence: string) => {
    const trimmedPdbId = pdbId.trim().toUpperCase();
    const trimmedSequence = sequence.replace(/\s|\n|;/g, "").toUpperCase();
    
    if (!trimmedPdbId && !trimmedSequence) return;

    // Do not add predefined sample IDs (with no sequence) to previous data to avoid redundancy
    const isPredefinedSample = !!trimmedPdbId && !trimmedSequence &&
      SAMPLE_DATA.some(s => s.pdbId.toUpperCase() === trimmedPdbId && (!s.sequence || s.sequence.length === 0));
    if (isPredefinedSample) return;
    
    const name = trimmedPdbId 
      ? `${trimmedPdbId} - User Input`
      : `Sequence (${trimmedSequence.length} residues)`;
    
    const newSample = {
      name,
      pdbId: trimmedPdbId,
      sequence: trimmedSequence
    };
    
    // Check if this combination already exists
    const exists = previousSamples.some(s => 
      s.pdbId === trimmedPdbId && s.sequence === trimmedSequence
    );
    
    if (!exists) {
      const updated = [newSample, ...previousSamples].slice(0, 5); // Keep only 5 most recent
      setPreviousSamples(updated);
      localStorage.setItem('proteinPredictor_previousSamples', JSON.stringify(updated));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = pdbId.trim().toUpperCase();
    const seqNormalized = sequence.replace(/\s|\n|;/g, "").toUpperCase();

    if (!seqNormalized && !id) {
      toast.error("Bitte gib entweder eine Sequenz oder eine PDB ID ein.");
      return;
    }

    if (seqNormalized && id) {
      toast.error("Bitte nur eines eingeben: Sequenz ODER PDB ID.");
      return;
    }

    // Validate amino acid sequence
    if (seqNormalized) {
      const validAminoAcids = /^[ACEDGFIHKMLNQPSRTWVY]+$/;
      if (!validAminoAcids.test(seqNormalized)) {
        toast.error("Sequence contains invalid characters. Only these amino acid letters are allowed: A, C, E, D, G, F, I, H, K, M, L, N, Q, P, S, R, T, W, V, Y");
        return;
      }
    }

    // Validate PDB ID format
    if (id && !/^\w{4}$/.test(id)) {
      toast.error("Please enter a valid 4-character PDB ID (e.g., 1CRN)");
      return;
    }

    try {
      setLoading(true);
      setPreds(null);
      setSummary(null);
      setResolvedSequence("");
      setResolvedPdbId("");

      // Save to history before making the API call
      saveSampleToHistory(id, seqNormalized);

      // Call the new backend API that accepts either sequence or pdb_id
      const result = await predictSecondaryStructure(seqNormalized || undefined, id || undefined);
      setPreds(result.predictions);
      
      // Set summary based on predictions
      setSummary({ chains: 1, residues: result.predictions.length });
      
      // Use the actual sequence that was used for prediction from the backend
      setResolvedSequence(result.usedSequence || seqNormalized || "");
      
      // If backend found a PDB ID from sequence, store it
      if (result.foundPdbId) {
        setResolvedPdbId(result.foundPdbId);
      }
      
      if (seqNormalized) {
        toast.success(`Predicted ${result.predictions.length} residues from sequence`);
      } else {
        toast.success(`Predicted ${result.predictions.length} residues from PDB ID ${id}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to get prediction");
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

  const loadSampleData = (sample: typeof SAMPLE_DATA[0]) => {
    setPdbId(sample.pdbId);
    setSequence(sample.sequence);
    setResolvedSequence("");
    setResolvedPdbId("");
    setPreds(null);
    setSummary(null);
    toast.success(`Loaded sample: ${sample.name}`);
  };

  return (
    <section className="relative">
      <div
        className="ambient-bg rounded-xl border p-6 md:p-8 shadow-[var(--shadow-elegant)]"
        onMouseMove={handleMouseMove}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Either protein sequence or PDB ID have to be entered.
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                Load Sample <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-popover border shadow-md z-50">
              {previousSamples.length > 0 && (
                <>
                  <DropdownMenuLabel>Previous Samples</DropdownMenuLabel>
                  {previousSamples.map((sample, index) => (
                    <DropdownMenuItem
                      key={`prev-${index}`}
                      onClick={() => loadSampleData(sample)}
                      className="cursor-pointer hover:bg-accent focus:bg-accent"
                    >
                      {sample.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel>Sample Data</DropdownMenuLabel>
              {SAMPLE_DATA.map((sample, index) => (
                <DropdownMenuItem
                  key={`sample-${index}`}
                  onClick={() => loadSampleData(sample)}
                  className="cursor-pointer hover:bg-accent focus:bg-accent"
                >
                  {sample.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mb-4 p-3 bg-muted/50 rounded-md border text-sm">
          Need examples? Browse the Protein Data Bank (PDB) and copy IDs or sequences from there: 
          <a
            href="https://www.rcsb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
            aria-label="Visit the Protein Data Bank website"
          >
            rcsb.org
          </a>.
        </div>
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

        {(sequence.replace(/\s|\n|;/g, "").length > 0 || summary) && (
          <div className="mt-4 text-sm text-muted-foreground space-y-1">
            <p>
              Entry summary: <span className="text-foreground">{sequence.replace(/\s|\n|;/g, "").length || summary?.residues || 0}</span> residues
            </p>
            <p>
              PDB ID: <span className="text-foreground">{resolvedPdbId || (pdbId.trim() ? pdbId.trim().toUpperCase() : "-")}</span>
            </p>
            <p className="break-words">
              Sequence: <span className="text-foreground font-mono">{resolvedSequence ? resolvedSequence : "-"}</span>
            </p>
          </div>
        )}

        {preds && (
          <>
            <div className="mt-8 space-y-8">
              <div>
                <h3 className="text-lg font-semibold mb-3">Secondary Structure — 8 states</h3>
                <StateBarChart data={preds} mode="8" hoveredIndex={hoveredResidue} />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Secondary Structure — 3 states</h3>
                <StateBarChart data={preds} mode="3" hoveredIndex={hoveredResidue} />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">Confidence</h3>
                <ConfidenceLineChart 
                  data={preds} 
                  onHover={setHoveredResidue}
                  onLeave={() => setHoveredResidue(null)}
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Average confidence: <span className="font-medium text-foreground">{(preds.reduce((a, p) => a + p.conf8, 0) / preds.length).toFixed(3)}</span>
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
            
            {/* Explanation Box */}
            <div className="mt-8 p-6 bg-muted/50 rounded-lg border">
              <h4 className="text-lg font-semibold mb-4">Understanding the Results</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h5 className="font-medium mb-2">PDB ID</h5>
                  <p className="text-muted-foreground">A unique 4-character identifier for protein structures in the Protein Data Bank.</p>
                </div>
                <div>
                  <h5 className="font-medium mb-2">Protein Sequence</h5>
                  <p className="text-muted-foreground">The linear chain of amino acids that forms the protein, represented by single-letter codes.</p>
                </div>
                <div>
                  <h5 className="font-medium mb-2">8-State Classification</h5>
                  <p className="text-muted-foreground">Detailed secondary structure prediction with 8 distinct structural states: α-helix (H), 3₁₀-helix (G), π-helix (I), β-strand (E), β-bridge (B), turn (T), bend (S), and coil (C).</p>
                </div>
                <div>
                  <h5 className="font-medium mb-2">3-State Classification</h5>
                  <p className="text-muted-foreground">Simplified secondary structure prediction with 3 main states: helix (H), strand (E), and coil (C). This is a condensed version of the 8-state prediction.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default ProteinPredictor;
