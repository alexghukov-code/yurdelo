import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const RESULTS: Array<{ value: string; label: string }> = [
  { value: 'win', label: 'Победа' },
  { value: 'lose', label: 'Проигрыш' },
  { value: 'part', label: 'Частично' },
  { value: 'world', label: 'Мировое' },
];

interface FinalResultMenuProps {
  currentResult: string | null;
  onSetResult: (result: string) => void;
}

export function FinalResultMenu({ currentResult, onSetResult }: FinalResultMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentLabel = RESULTS.find((r) => r.value === currentResult)?.label;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        {currentResult ? `${currentLabel}` : 'Установить'}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-40 bg-white rounded-lg shadow-lg border z-50">
          {RESULTS.map((r) => (
            <button
              key={r.value}
              onClick={() => {
                setOpen(false);
                if (confirm(`Установить результат: ${r.label}?`)) onSetResult(r.value);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                r.value === currentResult ? 'font-medium text-blue-700 bg-blue-50' : 'text-gray-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
