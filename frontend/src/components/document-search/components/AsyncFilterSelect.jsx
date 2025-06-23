import { fi } from "date-fns/locale";
import { useEffect, useState } from "react";
import AsyncSelect from "react-select/async";

export default function AsyncFilterSelect({
  title,
  options,
  filters,
  setFilters,
  placeholder = "Search...",
}) {
  const [selectedOptions, setSelectedOptions] = useState([]);

  // Initialize selected options from filters
  useEffect(() => {
    const initialSelected = Object.entries(filters)
      .filter(([_, isActive]) => isActive)
      .map(([value]) => ({ label: value, value }));
    setSelectedOptions(initialSelected);
  }, [filters]);

  // Convert option format for react-select
  const availableOptions = Object.keys(filters).map((item) => ({
    label: item,
    value: item,
  }));

  // Handle search function for AsyncSelect
  const loadOptions = async (inputValue) => {
    if (!inputValue) return availableOptions;

    return availableOptions.filter((option) =>
      option.label.toLowerCase().includes(inputValue.toLowerCase())
    );
  };

  // Update filters when selection changes
  const handleSelectionChange = (selected) => {
    setSelectedOptions(selected || []);

    // Update filter states to match selection
    const updatedFilters = { ...filters };

    // First, set all to false
    Object.keys(updatedFilters).forEach((key) => {
      updatedFilters[key] = false;
    });

    // Then set selected ones to true
    (selected || []).forEach((option) => {
      if (updatedFilters.hasOwnProperty(option.value)) {
        updatedFilters[option.value] = true;
      }
    });

    setFilters(updatedFilters);
  };

  return (
    <div>
      <label className="block text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {title}
      </label>
      <AsyncSelect
        cacheOptions
        defaultOptions={availableOptions}
        loadOptions={loadOptions}
        isMulti
        value={selectedOptions}
        placeholder={placeholder}
        onChange={handleSelectionChange}
        className="text-sm"
        classNamePrefix="filter-select"
        styles={{
          control: (base) => ({
            ...base,
            backgroundColor: "white",
          }),
          menu: (base) => ({
            ...base,
            backgroundColor: "white",
            zIndex: 50,
          }),
          menuPortal: (base) => ({
            ...base,
            zIndex: 9999,
          }),
        }}
        menuPortalTarget={typeof window !== "undefined" ? document.body : null}
      />
    </div>
  );
}
