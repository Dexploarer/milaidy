import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../AppContext";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({
  value,
  label = "copy",
  className = "",
}: CopyButtonProps) {
  const { copyToClipboard } = useApp();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`px-1.5 py-1 border border-border bg-bg text-[10px] font-mono cursor-pointer transition-all duration-200 inline-flex items-center gap-1 ${
        copied
          ? "border-ok text-ok bg-ok-subtle"
          : "hover:border-accent hover:text-accent"
      } ${className}`}
      aria-label={copied ? "Copied" : `Copy ${label}`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          <span>copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
