import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cityKey, cityLabel, cityOptions } from '../services/monitoring-cities';

export function CityPicker({ value, available = [], onChange, limit = 10 }) {
  const [query, setQuery] = useState('');
  const root = useRef(null),
    disclosure = useRef(null);
  const id = useId();
  const selected = new Set(value.map(cityKey));
  const options = cityOptions([...available, ...value]).filter((c) =>
    c.key.includes(cityKey(query)),
  );
  const close = () => {
    disclosure.current.open = false;
    disclosure.current.querySelector('summary').focus();
  };
  useEffect(() => {
    const outside = (event) => {
      if (!root.current.contains(event.target)) disclosure.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const toggle = (city) => {
    const key = cityKey(city);
    if (selected.has(key)) onChange(value.filter((c) => cityKey(c) !== key));
    else if (value.length < limit) onChange([...value, city]);
  };
  return (
    <fieldset className="city-picker full" ref={root}>
      <legend>Cidades</legend>
      <div className="city-picker-heading">
        <span id={`${id}-count`} aria-live="polite">
          {value.length} de {limit} selecionadas
        </span>
        <details
          className="city-picker-disclosure"
          ref={disclosure}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
        >
          <summary>
            Selecionar cidades <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="city-picker-panel">
            <div className="city-picker-search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar cidade"
                placeholder="Buscar cidade"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
              />
            </div>
            <div
              className="city-picker-options"
              role="group"
              aria-label="Cidades disponíveis"
              aria-describedby={`${id}-count`}
            >
              {options.map((city) => (
                <label key={city.key} className="city-picker-option">
                  <input
                    type="checkbox"
                    checked={selected.has(city.key)}
                    disabled={!selected.has(city.key) && value.length >= limit}
                    onChange={() => toggle(city.value)}
                  />
                  <span>{city.label}</span>
                </label>
              ))}
              {!options.length && <p role="status">Nenhuma cidade encontrada. Tente outro nome.</p>}
            </div>
            <div className="city-picker-footer">
              <span>
                {value.length >= limit
                  ? 'Limite de cidades atingido.'
                  : 'Marque as cidades que deseja consultar.'}
              </span>
              <button type="button" onClick={close}>
                Concluir seleção
              </button>
            </div>
          </div>
        </details>
      </div>
      <div className="city-picker-chips" aria-label="Cidades selecionadas">
        {value.map((city) => (
          <button
            key={city}
            type="button"
            aria-label={`Remover cidade ${cityLabel(city)}`}
            onClick={() => onChange(value.filter((c) => c !== city))}
          >
            {cityLabel(city)} <X size={14} aria-hidden="true" />
          </button>
        ))}
        {!value.length && <span>Selecione ao menos uma cidade.</span>}
      </div>
    </fieldset>
  );
}
