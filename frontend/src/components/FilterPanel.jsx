import React, { useEffect, useRef, useState } from "react";
import { ages } from "../constants/ages";
import { languages } from "../constants/languages";

const languageFlags = {
  FR: "🇫🇷", EN: "🇬🇧", GR: "🇬🇷", ES: "🇪🇸", DE: "🇩🇪", IT: "🇮🇹",
  PT: "🇵🇹", NL: "🇳🇱", AR: "🇸🇦", RU: "🇷🇺", ZH: "🇨🇳", JA: "🇯🇵",
};

export function FilterMenu({ label, value, options, onChange, renderOption = (option) => option.label }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="filter-menu" ref={menuRef}>
      <button
        type="button"
        className={`filter-menu-trigger ${open ? "is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="filter-menu-value">{renderOption(selected)}</span>
        <span className="filter-menu-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="filter-menu-options" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={`filter-menu-option ${option.value === value ? "is-selected" : ""}`}
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              {renderOption(option)}
              {option.value === value && <span className="filter-menu-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterPanel({ filters, setFilters, matchingCount, onApply }) {
  const ageOptions = [{ value: "", label: "All ages" }, ...ages.map(([value, label]) => ({ value, label }))];
  const languageOptions = [{ value: "", label: "All languages" }, ...languages.map(([value, label]) => ({ value, label, code: value }))];
  const availabilityOptions = [
    { value: "", label: "All books" },
    { value: "yes", label: "Available" },
    { value: "no", label: "Not available" },
  ];

  return (
    <div
      className="offcanvas offcanvas-end"
      tabIndex="-1"
      id="filterCanvas"
      aria-labelledby="filterCanvasLabel"
      style={{ width: "250px" }}
    >
      <div className="offcanvas-header filter-offcanvas-header">
        <h5 id="filterCanvasLabel">Filter books</h5>
        <button
          type="button"
          className="btn-close text-reset"
          data-bs-dismiss="offcanvas"
          aria-label="Close"
        ></button>
      </div>

      <div className="offcanvas-body">
        {/* Age */}
        <div className="mb-3">
          <label className="form-label">Age</label>
          <FilterMenu label="Age" value={filters.age} options={ageOptions} onChange={(age) => setFilters({ ...filters, age })} />
        </div>

        {/* Language */}
        <div className="mb-3">
          <label className="form-label">Language</label>
          <FilterMenu
            label="Language"
            value={filters.language}
            options={languageOptions}
            onChange={(language) => setFilters({ ...filters, language })}
            renderOption={(option) => <><span className="filter-language-flag" aria-hidden="true">{languageFlags[option.code] || "🌐"}</span><span>{option.label}</span>{option.code && <span className="filter-language-code">{option.code}</span>}</>}
          />
        </div>

        {/* Availability */}
        <div className="mb-3">
          <label className="form-label">Availability</label>
          <FilterMenu label="Availability" value={filters.available} options={availabilityOptions} onChange={(available) => setFilters({ ...filters, available })} renderOption={(option) => <><span className={`filter-availability-dot ${option.value || "all"}`} aria-hidden="true" />{option.label}</>} />
        </div>

        {/* 🆕 Owner */}
        <div className="mb-3">
          <label className="form-label">Owner</label>
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Enter owner's username"
              value={filters.owner || ""}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
            />
            {filters.owner && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                aria-label="Clear owner filter"
                onClick={() => setFilters({ ...filters, owner: "" })}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="filter-preview-count text-muted small text-center mb-3">
          {matchingCount} {matchingCount === 1 ? "book" : "books"} match these filters
        </div>

        {/* Reset and apply buttons */}
        <div className="d-grid">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() =>
              setFilters({ age: "", available: "", language: "", owner: "" })
            }
          >
            Reset all filters
          </button>
          <button type="button" className="btn btn-primary mt-2" data-bs-dismiss="offcanvas" onClick={onApply}>Apply filters</button>
        </div>
      </div>
    </div>
  );
}
