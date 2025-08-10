import React from "react";
import { cn } from "@/lib/utils";

interface TinyFoldTitansLogoProps {
  className?: string;
}

const TinyFoldTitansLogo: React.FC<TinyFoldTitansLogoProps> = ({ className }) => {
  return (
    <a
      href="/"
      className={cn(
        "group inline-flex items-center gap-3 select-none",
        className
      )}
      aria-label="TinyFoldTitans — Home"
      title="TinyFoldTitans"
    >
      <span
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border bg-secondary text-primary shadow-sm"
        aria-hidden="true"
      >
        {/* Helix mark */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transition-transform duration-300 group-hover:rotate-6"
        >
          <path
            d="M6 18c3.5-3 8.5-3 12 0M6 6c3.5 3 8.5 3 12 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M9 20c0-6 6-10 6-16"
            stroke="currentColor"
            strokeOpacity="0.7"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span
          className="text-base font-bold tracking-tight bg-clip-text text-transparent"
          style={{ background: "var(--gradient-primary)" }}
        >
          TinyFoldTitans
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">Protein Research</span>
      </span>
    </a>
  );
};

export default TinyFoldTitansLogo;
