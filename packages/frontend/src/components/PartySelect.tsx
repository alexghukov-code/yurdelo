import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchParties } from '../api/parties';
import { useDebounce } from '../hooks/useDebounce';

interface PartySelectProps {
  label: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
}

export function PartySelect({ label, value, onChange, error }: PartySelectProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data } = useQuery({
    queryKey: ['parties', { search: debouncedSearch }],
    queryFn: () => fetchParties({ search: debouncedSearch || undefined, limit: 50 }),
    placeholderData: (prev) => prev,
  });

  const parties = data?.data ?? [];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        placeholder="Поиск..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-t-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-b-lg border border-t-0 border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-300' : ''
        }`}
        size={Math.min(parties.length + 1, 6)}
      >
        <option value="">— Выберите —</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.inn ? ` (ИНН ${p.inn})` : ''}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
