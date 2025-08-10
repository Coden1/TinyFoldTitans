import ProteinPredictor from "@/components/ProteinPredictor";
import { Helmet } from "react-helmet-async";


const Index = () => {
  return (
    <>
      <Helmet>
        <title>Protein Secondary Structure Predictor | PDB</title>
        <meta name="description" content="Predict protein secondary structure from a PDB ID and visualize per-residue states and confidence." />
        <link rel="canonical" href={typeof window !== 'undefined' ? window.location.href : '/'} />
        <meta property="og:title" content="Protein Secondary Structure Predictor" />
        <meta property="og:description" content="Enter a PDB ID to get 3-state and 8-state secondary structure plots with confidence." />
        <meta property="og:type" content="website" />
      </Helmet>
      <header className="py-10">
        <div className="container flex items-start justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Protein Secondary Structure Prediction</h1>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
              Enter a PDB ID to generate per-residue secondary structure (8-state and 3-state) and confidence plots.
            </p>
          </div>
          <div className="flex items-baseline gap-2"><span className="italic text-xs text-muted-foreground">by</span><span className="font-brand text-xl md:text-2xl font-semibold tracking-tight">TinyFoldTitans</span></div>
        </div>
      </header>
      <main className="container pb-20">
        <ProteinPredictor />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Protein Secondary Structure Predictor",
            applicationCategory: "Science",
            operatingSystem: "Web",
            description: "Predict protein secondary structure and visualize results from a PDB ID.",
          })}
        </script>
      </main>
    </>
  );
};

export default Index;
